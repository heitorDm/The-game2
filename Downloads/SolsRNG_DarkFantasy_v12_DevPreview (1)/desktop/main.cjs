const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

const APP_HOST = '127.0.0.1';
let serverPort = 0;
let serverProcess = null;
let mainWindow = null;
let appBaseUrl = '';
let quitting = false;

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, APP_HOST, () => {
      const port = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function serverExecutable() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'sols-server', 'SolsRNGDarkFantasyServer.exe');
  return path.join(__dirname, '..', 'dist', 'SolsRNGDarkFantasyServer', 'SolsRNGDarkFantasyServer.exe');
}

function startLocalServer() {
  const exe = serverExecutable();
  if (!fs.existsSync(exe)) throw new Error(`Não encontrei o servidor local:\n${exe}\n\nCompile o pacote com build_windows_installer.bat e execute o instalador gerado.`);
  serverProcess = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PORT: String(serverPort),
      OPEN_BROWSER: '0',
      APP_ENV: 'production',
      COOKIE_SECURE: '0',
      FLASK_DEBUG: '0'
    }
  });
  serverProcess.on('error', error => {
    if (!quitting) dialog.showErrorBox("Erro ao iniciar o servidor local", error.message || String(error));
  });
  serverProcess.on('exit', code => {
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'error', title: "Sol's RNG - Dark Fantasy",
        message: 'O servidor local do jogo foi encerrado.',
        detail: `Código de saída: ${code ?? 'desconhecido'}. Feche e abra o jogo novamente.`
      }).finally(() => app.quit());
    }
  });
}

async function waitForHealth(baseUrl, timeoutMs = 25000) {
  const until = Date.now() + timeoutMs;
  let lastError;
  const url = new URL('/healthz', baseUrl).toString();
  while (Date.now() < until) {
    if (serverProcess && serverProcess.exitCode !== null) throw new Error('O servidor local encerrou antes de iniciar.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (response.ok) return;
      lastError = new Error(`O servidor respondeu com HTTP ${response.status}.`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`O servidor não respondeu em ${Math.round(timeoutMs / 1000)} segundos. ${lastError?.message || ''}`);
}

function chooseServerMode() {
  return new Promise(resolve => {
    let settled = false;
    const chooser = new BrowserWindow({
      width: 540, height: 500, resizable: false, maximizable: false, minimizable: false,
      show: false, frame: true, autoHideMenuBar: true, backgroundColor: '#080910',
      title: "Sol's RNG - Escolher servidor",
      icon: app.isPackaged ? path.join(process.resourcesPath, 'sols-rng.ico') : path.join(__dirname, '..', 'static', 'sols-rng.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'connect-preload.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    const handler = (_event, choice) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('sols-server-choice', handler);
      resolve(choice);
      if (!chooser.isDestroyed()) chooser.close();
    };
    ipcMain.handle('sols-get-last-url', () => {
      try { return fs.readFileSync(path.join(app.getPath('userData'), 'last-server-url.txt'), 'utf8').trim(); } catch (_) { return ''; }
    });
    ipcMain.on('sols-server-choice', handler);
    chooser.on('ready-to-show', () => chooser.show());
    chooser.on('closed', () => {
      if (!settled) {
        settled = true;
        ipcMain.removeListener('sols-server-choice', handler);
        resolve(null);
      }
    });
    chooser.loadFile(path.join(__dirname, 'connect.html'));
  });
}

async function resolveServer(choice) {
  if (!choice || !['local', 'online'].includes(choice.mode)) throw new Error('Seleção de servidor cancelada.');
  if (choice.mode === 'local') {
    serverPort = await freePort();
    startLocalServer();
    appBaseUrl = `http://${APP_HOST}:${serverPort}/`;
    await waitForHealth(appBaseUrl);
    return;
  }
  let parsed;
  try { parsed = new URL(String(choice.url || '').trim()); }
  catch (_) { throw new Error('Informe a URL pública completa do servidor, por exemplo https://seu-jogo.onrender.com.'); }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Para jogar online, informe apenas a URL base HTTPS do servidor, sem caminho, senha ou parâmetros.');
  }
  appBaseUrl = parsed.origin + '/';
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(path.join(app.getPath('userData'), 'last-server-url.txt'), appBaseUrl, 'utf8'); } catch (_) {}
  await waitForHealth(appBaseUrl, 15000);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360, height: 860, minWidth: 960, minHeight: 650,
    show: false, backgroundColor: '#080910', title: "Sol's RNG - Dark Fantasy",
    icon: app.isPackaged ? path.join(process.resourcesPath, 'sols-rng.ico') : path.join(__dirname, '..', 'static', 'sols-rng.ico'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const currentOrigin = new URL(appBaseUrl).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== currentOrigin) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== currentOrigin) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch (_) { event.preventDefault(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(appBaseUrl);
  mainWindow.show();
}

app.whenReady().then(async () => {
  try {
    const choice = await chooseServerMode();
    if (!choice) return app.quit();
    await resolveServer(choice);
    await createWindow();
  } catch (error) {
    dialog.showErrorBox("Não foi possível iniciar Sol's RNG", error.message || String(error));
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});
app.on('window-all-closed', () => app.quit());
