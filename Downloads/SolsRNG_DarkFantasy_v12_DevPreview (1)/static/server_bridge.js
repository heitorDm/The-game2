/* Camada de servidor local: login simples, save na conta e salas de coop por convite. */
(() => {
  'use strict';
  const MP = window.MP;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha no servidor (${response.status}).`);
    return data;
  };

  const accountStyle = document.createElement('style');
  accountStyle.textContent = `
    .mp-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:4px 0 12px}
    .mp-auth-tabs button{padding:12px 8px;border:2px solid #383848;background:#101016;color:#8e8e9f;font:10px var(--px);cursor:pointer}
    .mp-auth-tabs button.selected{color:#f4d78d;border-color:#c89b3c;background:#211a12}
    .mp-config .mp-primary{width:100%;margin:4px 0 0;background:#4d171a;border-color:#9d4a3d;color:#fff}
    .mp-config .mp-primary:hover{background:#6a2024;border-color:#e0b55c}
    .mp-invite-label{display:flex;flex-direction:column;gap:5px;color:#c89b3c;font:9px var(--px)}
    .mp-invite-label input{width:100%;padding:10px;background:#08080d;color:#f0d27f;border:1px solid #8b692d;font:16px var(--rt);user-select:text}
    #mp-create-room{width:100%;}
    #mp-code{width:100%;max-width:none;text-align:center;letter-spacing:2px;text-transform:uppercase;}
    .mp-config input{user-select:text;}
    .mp-friends,.mp-run-card{display:flex;flex-direction:column;gap:9px;padding:12px;margin:8px 0;background:linear-gradient(145deg,#15141b,#0b0b10);border:1px solid #59452e;box-shadow:inset 0 0 0 1px #08080b}.mp-primary{font-size:11px!important;min-height:44px}.mp-room .mp-note strong{color:#f0d48d}.mp-server-warning{padding:10px;border:1px solid #815b35;background:#21170f;color:#eed2a0;line-height:1.3}
    .mp-friends-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .mp-coop-screen{display:flex;flex-direction:column;gap:11px}.mp-coop-banner{display:flex;justify-content:space-between;gap:10px;padding:10px;background:linear-gradient(120deg,#211929,#0c1019);border:1px solid #73532e;color:#e7c576;font:9px var(--px)}
    .mp-turn-hint{padding:8px;margin:0;background:#1d1616;border:1px solid #5c3734;color:#d6bdaf;font:9px var(--px);text-align:center}.mp-turn-hint.is-mine{background:#13221b;border-color:#3a7c56;color:#b6f2c7}
    .mp-party-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mp-party-member{padding:9px;background:#11121a;border:1px solid #37313f}.mp-party-title{display:flex;justify-content:space-between;gap:5px;font:8px var(--px);color:#ecd7a7}.mp-party-title span{color:#9b91aa}.mp-stat-line{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:6px;margin:8px 0;font:12px var(--rt)}.mp-stat-line i,.mp-enemy-hp{height:8px;background:#08090e;border:1px solid #34313a;display:block;overflow:hidden}.mp-stat-line i b,.mp-enemy-hp b{display:block;height:100%;background:linear-gradient(90deg,#7f282a,#d45b54)}.mp-party-member small{color:#b3a7bd;font:12px var(--rt)}
    .mp-enemy{padding:12px;background:linear-gradient(130deg,#2b1119,#0c0c12);border:1px solid #87343d}.mp-enemy>div:first-child{display:flex;justify-content:space-between;gap:8px;align-items:center}.mp-enemy span{font:7px var(--px);color:#ff8e86}.mp-enemy strong{font:10px var(--px);color:#f1d3ab}.mp-enemy-hp{margin:9px 0 5px;height:12px}.mp-enemy-hp b{background:linear-gradient(90deg,#64131d,#e94c54)}.mp-enemy small{font:12px var(--rt);color:#d2b8b4}
    .mp-coop-log{padding:10px;border-left:3px solid #be9b4e;background:#15131a}.mp-coop-log small{font:7px var(--px);color:#d7b66a}.mp-coop-log p{margin:6px 0 0;font:16px/1.4 var(--rt);color:#eee1ce}.mp-coop-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mp-turn-action{min-height:45px;border-color:#80643b!important}.mp-turn-action:disabled{opacity:.38}

    .mp-friends-grid>div{display:flex;flex-direction:column;gap:7px;min-width:0}
    .mp-friends input{flex:1;min-width:0;padding:10px;background:#08080d;color:var(--txt);border:1px solid #55432d;font:18px var(--rt)}
    .mp-player .row{gap:4px}.mp-player .btn{flex:1;font-size:8px;padding:7px 4px}
    .mp-run-card strong{color:#f0d48d}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    @media(max-width:560px){.mp-auth-tabs button{font-size:8px}.mp-config .mp-primary{min-height:44px}.mp-friends-grid,.mp-party-grid{grid-template-columns:1fr}.mp-friends .row{align-items:stretch}.mp-friends .row .btn{min-width:105px}.mp-coop-actions{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(accountStyle);

  const gateStyle = document.createElement('style');
  gateStyle.textContent = `
    #mp-auth-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(ellipse at 50% 20%,rgba(70,42,79,.84),rgba(5,6,12,.97) 68%),linear-gradient(120deg,#090911,#17111c);backdrop-filter:blur(8px)}
    #mp-auth-gate.hidden{display:none!important}#mp-auth-gate .gate-card{width:min(460px,100%);max-height:94dvh;overflow:auto;padding:24px;background:linear-gradient(145deg,#171722,#090a10);border:1px solid #8c6c3d;box-shadow:0 0 0 3px #050509,0 24px 90px #000c;color:#f2e9d7}
    #mp-auth-gate .gate-brand{font:clamp(20px,4vw,30px) var(--px);text-align:center;color:#f0d188;letter-spacing:.04em;text-shadow:2px 2px #000,0 0 22px #a66a3b66}
    #mp-auth-gate .gate-sub{text-align:center;color:#b9adbd;margin:10px 0 18px;font:14px/1.5 var(--rt)}
    #mp-auth-gate .gate-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
    #mp-auth-gate button{cursor:pointer;font:10px var(--px);padding:12px 10px;color:#e7ddcc;background:#15141d;border:1px solid #55432d;min-height:42px}
    #mp-auth-gate button.active,#mp-auth-gate .gate-submit{background:linear-gradient(#5b2928,#32141a);border-color:#c9a053;color:#ffe7ac}
    #mp-auth-gate label{display:flex;flex-direction:column;gap:5px;margin:10px 0;color:#d6b66a;font:9px var(--px)}
    #mp-auth-gate input{width:100%;min-width:0;padding:12px;background:#08080d;border:1px solid #55432d;color:#fff;font:16px var(--rt);outline-offset:2px}
    #mp-auth-gate .gate-note{min-height:28px;margin:10px 0 0;font:14px/1.4 var(--rt);color:#d9c8a8}
    #mp-auth-gate .gate-note.error{color:#ff9c91}#mp-auth-gate .gate-foot{text-align:center;margin-top:14px;color:#8f899a;font:12px/1.5 var(--rt)}
    #mp-auth-gate .gate-help{margin-top:12px;padding:9px;background:#201a14;border:1px solid #6f4d2c;color:#e7d2ab;font:13px/1.4 var(--rt)}
    @media(max-width:480px){#mp-auth-gate .gate-card{padding:16px}#mp-auth-gate .gate-brand{font-size:18px}}
  `;
  document.head.appendChild(gateStyle);
  const authGate = document.createElement('div');
  authGate.id = 'mp-auth-gate';
  authGate.className = '';
  authGate.setAttribute('role', 'dialog');
  authGate.setAttribute('aria-modal', 'true');
  authGate.setAttribute('aria-labelledby', 'mp-gate-title');
  authGate.innerHTML = `
    <div class="gate-card">
      <div class="gate-brand" id="mp-gate-title">☾ SOL'S RNG</div>
      <div class="gate-sub">DARK FANTASY · SUA AVENTURA COMEÇA AQUI</div>
      <div class="gate-tabs"><button id="mp-gate-signin-tab" class="active" type="button" onclick="MP.setGateMode('signin')">ENTRAR</button><button id="mp-gate-signup-tab" type="button" onclick="MP.setGateMode('signup')">CRIAR CONTA</button></div>
      <form id="mp-gate-form">
        <label id="mp-gate-name-wrap" class="hidden">NOME DE JOGADOR<input id="mp-gate-name" maxlength="24" autocomplete="nickname" placeholder="Como seus amigos vão te ver"></label>
        <label>E-MAIL<input id="mp-gate-email" type="email" maxlength="254" required autocomplete="email" placeholder="voce@exemplo.com"></label>
        <label>SENHA<input id="mp-gate-password" type="password" minlength="8" maxlength="200" required autocomplete="current-password" placeholder="Sua senha"></label>
        <button class="gate-submit" id="mp-gate-submit" type="submit" style="width:100%;margin-top:4px">ENTRAR NO JOGO</button>
      </form>
      <div id="mp-gate-note" class="gate-note" role="status">Entre ou crie uma conta para jogar, salvar e convidar amigos.</div>
      <div class="gate-help">Para jogar de longe com seus amigos, o servidor precisa estar publicado na internet. A conta e os convites já ficam disponíveis neste servidor.</div>
      <div class="gate-foot">Sua senha é armazenada como hash no servidor, não em texto puro.</div>
    </div>`;
  document.body.appendChild(authGate);
  const gateForm = $('mp-gate-form');
  gateForm.addEventListener('submit', event => { event.preventDefault(); MP.auth(MP.authMode === 'signup' ? 'signup' : 'signin'); });

  MP.client = null;
  MP.socket = null;
  MP.channel = null;
  MP.user = null;
  MP.room = null;
  MP.host = false;
  MP.players = [];
  MP.battle = null;
  MP.friendsData = { friends: [], incoming: [], outgoing: [], roomInvites: [] };
  MP._roomRun = null;
  MP.roomStatus = 'Offline';
  MP.cloudSaveReady = false;
  MP.authMode = 'signin';
  MP.notice = '';
  MP.emailDraft = '';
  MP.nameDraft = '';
  MP._saveTimer = null;
  MP._socketBound = false;
  MP._inviteHandled = false;

  MP.localPlayerPayload = function () {
    const c = (typeof G !== 'undefined' && G.char) || { id: 'campones', hp: 100, mp: 30, str: 8 };
    const s = (typeof G !== 'undefined' && G.s) || {};
    return {
      classId: c.id || 'campones',
      hp: s.hp ?? c.hp ?? 100,
      maxHp: s.maxHp ?? c.hp ?? 100,
      mp: s.mp ?? c.mp ?? 30,
      maxMp: s.maxMp ?? c.mp ?? 30,
      dmg: typeof G !== 'undefined' && G.s ? G.dmg() : (c.str || 8),
      stage: s.stage || 1,
      role: c.id === 'medica' ? 'Suporte' : c.id === 'mago' ? 'Mago' : 'Aventureiro'
    };
  };

  MP.ensureClient = async function () {
    if (!this.user) throw new Error('Entre na sua conta para jogar online.');
    await this.ensureSocket();
  };

  MP.ensureSocket = async function () {
    if (!this.socket) {
      if (typeof window.io !== 'function') throw new Error('O cliente de conexão não carregou. Atualize a página.');
      this.socket = window.io({ autoConnect: false, reconnection: true, reconnectionAttempts: 8, timeout: 8000 });
      const sock = this.socket;
      sock.on('room_roster', data => {
        if (!data || (data.code !== this.room && data.code !== this._joiningRoom)) return;
        this.room = data.code;
        this.players = Array.isArray(data.players) ? data.players : [];
        this.host = data.hostId === this.user?.id;
        this.roomStatus = 'Conectado';
        this.channel = this.channel || { untrack: async () => sock.emit('room_leave') };
        if (data.run) this._roomRun = data.run;
        if (data.battle) this.battle = data.battle;
        this.renderRoster();
        this.renderRunPanel();
      });
      sock.on('coop_message', packet => this.receive(packet));
      sock.on('room_error', data => this.onlinePanel(data?.message || 'Ocorreu um erro na sala.'));
      sock.on('connect_error', () => {
        this.roomStatus = 'Desconectado';
      });
      sock.on('connect', () => {
        this.roomStatus = 'Online';
        // Tenta voltar à sala em caso de reconexão momentânea.
        if (this.room && this.user) {
          const code = this.room;
          this._joiningRoom = code;
          sock.emit('room_join', { code, player: this.localPlayerPayload() }, result => {
            this._joiningRoom = null;
            if (result?.ok) {
              this.room = result.code;
              this.host = result.hostId === this.user?.id;
              this.players = result.players || [];
              this.roomStatus = 'Reconectado';
              this._roomRun = result.run || this._roomRun;
              this.battle = result.battle || this.battle;
              this.renderRoster();
              this.renderRunPanel();
            }
          });
        }
      });
    }
    if (this.socket.connected) return true;
    const sock = this.socket;
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.off('connect', onConnect);
        sock.off('connect_error', onError);
        err ? reject(err) : resolve(true);
      };
      const onConnect = () => finish();
      const onError = () => finish(new Error('Não foi possível conectar ao servidor. Verifique se ele está ligado e tente novamente.'));
      const timer = setTimeout(() => finish(new Error('O servidor demorou a responder. Tente de novo.')), 9000);
      sock.once('connect', onConnect);
      sock.once('connect_error', onError);
      sock.connect();
    });
    return true;
  };

  MP.setGateMode = function (mode) {
    this.authMode = mode === 'signup' ? 'signup' : 'signin';
    $('mp-gate-name-wrap')?.classList.toggle('hidden', this.authMode !== 'signup');
    $('mp-gate-password')?.setAttribute('autocomplete', this.authMode === 'signup' ? 'new-password' : 'current-password');
    const name = $('mp-gate-name'); if (name) name.required = this.authMode === 'signup';
    $('mp-gate-signin-tab')?.classList.toggle('active', this.authMode === 'signin');
    $('mp-gate-signup-tab')?.classList.toggle('active', this.authMode === 'signup');
    const submit = $('mp-gate-submit'); if (submit) submit.textContent = this.authMode === 'signup' ? 'CRIAR CONTA E ENTRAR' : 'ENTRAR NO JOGO';
    const note = $('mp-gate-note'); if (note) { note.classList.remove('error'); note.textContent = this.authMode === 'signup' ? 'Escolha um nome, e-mail e senha com pelo menos 8 caracteres.' : 'Entre com sua conta para recuperar o progresso e jogar com amigos.'; }
  };

  MP.showAccountGate = function (show, message = '') {
    const gate = $('mp-auth-gate'); if (!gate) return;
    gate.classList.toggle('hidden', !show);
    if (show) {
      this.setGateMode(this.authMode || 'signin');
      if (!$('mp-gate-email')?.value) $('mp-gate-email').value = this.emailDraft || '';
      if (message) { const note = $('mp-gate-note'); if (note) { note.textContent = message; note.classList.add('error'); } }
      setTimeout(() => { const focus = this.authMode === 'signup' ? $('mp-gate-name') : $('mp-gate-email'); focus?.focus(); }, 0);
    } else {
      const game = $('game'); if (game) game.classList.remove('mp-auth-required');
    }
  };

  MP.auth = async function (mode) {
    try {
      const email = $('mp-gate-email')?.value.trim() || $('mp-email')?.value.trim() || this.emailDraft || '';
      const password = $('mp-gate-password')?.value || $('mp-password')?.value || '';
      const username = $('mp-gate-name')?.value.trim() || $('mp-name')?.value.trim() || this.nameDraft || '';
      this.emailDraft = email;
      this.nameDraft = username;
      if (!email || !password) throw new Error('Informe seu e-mail e sua senha.');
      if (mode === 'signup' && username.length < 2) throw new Error('Escolha um nome de jogador com pelo menos 2 caracteres.');
      const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login';
      const body = mode === 'signup' ? { username, email, password } : { email, password };
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      this.user = result.user;
      this.emailDraft = result.user.email || email;
      this.nameDraft = result.user.username || username;
      this.client = { backend: 'Sols RNG server' };
      this.notice = result.message || 'Conta conectada.';
      await this.ensureSocket();
      await this.afterLogin({ preserveLocal: mode === 'signup' });
      this.authMode = 'signin';
      this.showAccountGate(false);
      const front = $('front-account-state'); if (front) front.textContent = `Conectado como ${this.user.username}. Seu progresso acompanha sua conta.`;
      if (new URLSearchParams(location.search).get('room')) this.onlinePanel(this.notice);
      else if (typeof G.say === 'function') G.say('Sistema', this.notice || 'Você entrou na conta. Boa aventura!');
    } catch (error) {
      this.notice = error.message || 'Não foi possível entrar na conta.';
      const note = $('mp-gate-note'); if (note) { note.textContent = this.notice; note.classList.add('error'); }
      if (!this.user) this.showAccountGate(true, this.notice);
      else this.showAccountGate(true, 'A conta foi encontrada, mas a conexão não terminou. Confira o servidor e tente novamente.');
    }
  };

  MP.afterLogin = async function ({ preserveLocal = false, fromBoot = false } = {}) {
    if (!this.user) return;
    this.cloudSaveReady = false;
    const result = await api('/api/save');
    const saved = result.save_data || {};
    const serverHasData = typeof saved.save === 'string' || typeof saved.meta === 'string';
    if (serverHasData) {
      if (typeof saved.save === 'string') localStorage.setItem('solrng_save', saved.save);
      else localStorage.removeItem('solrng_save');
      if (typeof saved.meta === 'string') localStorage.setItem('solrng_meta', saved.meta);
      else localStorage.removeItem('solrng_meta');
    } else if (preserveLocal) {
      // Ao criar a conta, transforma o progresso local atual em progresso da conta.
      await this.syncCloudSave();
    } else {
      // Uma conta diferente não deve herdar dados locais de outra pessoa.
      localStorage.removeItem('solrng_save');
      localStorage.removeItem('solrng_meta');
    }
    this.cloudSaveReady = true;
    if (typeof Meta !== 'undefined') {
      Meta.load();
      Meta.profileName = this.user.username || this.user.email?.split('@')[0] || 'Aventureiro';
      Meta.save();
    }
    if (typeof G !== 'undefined' && typeof G.init2 === 'function') G.init2();
    await this.refreshFriends().catch(() => {});
    const invite = new URLSearchParams(location.search).get('room');
    if (invite && !this._inviteHandled) {
      this._inviteHandled = true;
      this.ensureRunForCoop();
      await this.joinRoom(invite, false);
    }
  };

  MP.syncCloudSave = async function () {
    if (!this.user || !this.client) return;
    await api('/api/save', {
      method: 'PUT',
      body: JSON.stringify({
        save: localStorage.getItem('solrng_save'),
        meta: localStorage.getItem('solrng_meta')
      })
    });
    this.cloudSaveReady = true;
  };

  MP.queueCloudSave = function () {
    if (!this.user || !this.client || !this.cloudSaveReady) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.syncCloudSave().catch(() => {
      this.cloudSaveReady = false;
      this.roomStatus = 'Save aguardando conexão';
    }), 800);
  };

  MP.logout = async function () {
    try {
      if (this.user && this.client && this.cloudSaveReady) await this.syncCloudSave();
      if (this.socket?.connected) {
        this.socket.emit('room_leave');
        this.socket.disconnect();
      }
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch (_) {
      // Mesmo sem resposta do servidor, encerra a sessão visualmente.
    }
    this.user = null;
    this.client = null;
    this.channel = null;
    this.room = null;
    this.host = false;
    this.players = [];
    this.battle = null;
    this.roomStatus = 'Offline';
    this.authMode = 'signin';
    const front = $('front-account-state'); if (front) front.textContent = 'Entre ou crie sua conta para guardar progresso e jogar com amigos.';
    if (typeof G.closeModal === 'function') G.closeModal();
    this.showAccountGate(true, 'Você saiu da conta. Entre novamente para continuar.');
    this.notice = 'Você saiu da conta. O progresso salvo nela permanece guardado.';
  };

  MP.refreshFriends = async function () {
    if (!this.user) { this.friendsData = { friends: [], incoming: [], outgoing: [], roomInvites: [] }; return this.friendsData; }
    this.friendsData = await api('/api/friends');
    this.friendsData.roomInvites = Array.isArray(this.friendsData.roomInvites) ? this.friendsData.roomInvites : [];
    return this.friendsData;
  };

  MP.addFriend = async function () {
    try {
      const username = $('mp-friend-name')?.value.trim() || '';
      const result = await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ username }) });
      await this.refreshFriends();
      this.onlinePanel(result.message || 'Convite de amizade enviado.');
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível enviar o convite.'); }
  };

  MP.respondFriend = async function (requestId, decision) {
    try {
      const result = await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ requestId, decision }) });
      await this.refreshFriends();
      this.onlinePanel(result.message || 'Lista de amigos atualizada.');
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível responder ao convite.'); }
  };

  MP.removeFriend = async function (friendId) {
    try {
      await api(`/api/friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' });
      await this.refreshFriends();
      this.onlinePanel('Amigo removido da lista.');
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível remover o amigo.'); }
  };

  MP.inviteFriend = async function (friendId) {
    try {
      const friend = (this.friendsData?.friends || []).find(f => String(f.id) === String(friendId));
      if (!friend) throw new Error('Atualize a lista de amigos e tente novamente.');
      if (!this.room) {
        await this.createRoom();
        if (!this.room) return;
      }
      // Create a persistent in-game invitation addressed to the selected account.
      await api('/api/rooms/invite', { method: 'POST', body: JSON.stringify({ friendId, roomCode: this.room }) });
      const hostname = location.hostname.toLowerCase();
      const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(hostname);
      const isPrivateIPv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
      if (isLoopback) {
        this.onlinePanel(`Convite guardado para ${friend.username}. Para vocês jogarem na mesma rede, envie o código ${this.room}; para jogar de outro estado, publique este servidor em HTTPS e use o endereço público.`);
        return;
      }
      const u = new URL(location.href);
      u.searchParams.set('room', this.room);
      let copied = false;
      try { await navigator.clipboard.writeText(u.toString()); copied = true; } catch (_) {}
      const localWarning = isPrivateIPv4 ? ' Este endereço é privado e não abre fora da sua rede.' : '';
      this.onlinePanel(`${copied ? 'Link de convite copiado' : 'Link pronto para copiar'} para ${friend.username}.${localWarning} Link: ${u.toString()}`);
      const input = $('mp-invite-link'); if (input) { input.value = u.toString(); input.focus(); input.select(); }
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível enviar o convite.'); }
  };

  MP.dismissRoomInvite = async function (inviteId) {
    try {
      await api(`/api/rooms/invite/${Number(inviteId)}`, { method: 'DELETE' });
      await this.refreshFriends();
      this.onlinePanel('Convite ignorado.');
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível ignorar o convite.'); }
  };

  MP.joinInvite = async function (inviteId, roomCode) {
    await this.joinRoom(roomCode, false);
    // Remove the invitation only after the room join has produced a connected state.
    if (this.room === roomCode) {
      try { await api(`/api/rooms/invite/${Number(inviteId)}`, { method: 'DELETE' }); } catch (_) {}
      await this.refreshFriends().catch(() => {});
    }
  };

  MP.startRun = async function () {
    if (!this.host || !this.room || this.players.length < 2) return this.onlinePanel('Convide pelo menos um amigo antes de iniciar a expedição.');
    try {
      const result = await this.send('run_start', { difficulty: G.diff || 'medium' });
      if (!result?.ok) throw new Error(result?.error || 'Não foi possível iniciar a expedição.');
      this._roomRun = result.run || this._roomRun;
      this._coopWindowOpen = true;
      this.openCoopRun();
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível iniciar a run compartilhada.'); }
  };

  MP.coopAction = async function (action) {
    try {
      const result = await this.send('player_action', { action });
      if (!result?.ok) {
        if (result?.run) this._roomRun = result.run;
        if (this._coopWindowOpen && this._roomRun) { this.openCoopRun(); if (typeof G.say === 'function') G.say('Expedição', result?.error || 'Ação não realizada.'); }
        else this.onlinePanel(result?.error || 'Ação não realizada.');
        return;
      }
      this._roomRun = result.run || this._roomRun;
      if (this._coopWindowOpen) this.openCoopRun();
      this.renderRoster();
    } catch (error) { this.onlinePanel(error.message || 'Não foi possível realizar a ação.'); }
  };

  MP.advanceRun = function (kind = 'explore') {
    return this.coopAction(kind === 'combat' ? 'attack' : 'explore');
  };

  MP.openCoopRun = function () {
    const r = this._roomRun;
    if (!r || !this.room) return this.onlinePanel('Crie uma sala e inicie uma expedição com pelo menos um amigo.');
    this._coopWindowOpen = true;
    const party = Object.values(r.party || {});
    const order = r.turnOrder || [];
    const currentId = order.length ? order[(r.turnIndex || 0) % order.length] : null;
    const currentName = party.find(p => p.id === currentId)?.name || '—';
    const mine = currentId === this.user?.id;
    const phase = r.phase || 'exploration';
    const phaseLabel = ({ exploration: 'EXPLORAÇÃO', encounter: 'ENCONTRO', complete: 'CONCLUÍDA', failed: 'DERROTA' })[phase] || phase.toUpperCase();
    const members = party.map(p => {
      const hpPct = Math.max(0, Math.min(100, Math.round(p.hp / Math.max(1, p.maxHp) * 100)));
      return `<div class="mp-party-member"><div class="mp-party-title"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.classId || 'aventureiro')}</span></div><div class="mp-stat-line"><span>HP ${p.hp}/${p.maxHp}</span><i><b style="width:${hpPct}%"></b></i><span>MP ${p.mp}/${p.maxMp}</span></div><small>Ouro da expedição: ${Number(p.gold || 0)} · Materiais: ${Object.values(p.materials || {}).reduce((a,b)=>a+b,0)}</small></div>`;
    }).join('');
    const enemy = r.enemy ? `<div class="mp-enemy"><div><span>${r.enemy.boss ? '⚠ AMEAÇA MAIOR' : 'ENCONTRO'}</span><strong>${escapeHtml(r.enemy.name)}</strong></div><div class="mp-enemy-hp"><b style="width:${Math.max(0,Math.min(100,Math.round(r.enemy.hp/Math.max(1,r.enemy.maxHp)*100)))}%"></b></div><small>HP ${r.enemy.hp}/${r.enemy.maxHp}</small></div>` : '';
    let actions = '';
    if (phase === 'exploration') actions = `<button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('explore')">🧭 EXPLORAR</button><button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('gather')">⛏ COLETAR MATERIAIS</button><button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('rest')">✦ DESCANSAR</button>`;
    else if (phase === 'encounter') actions = `<button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('attack')">⚔ ATACAR</button><button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('magic')">✧ MAGIA (-12 MP)</button><button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('defend')">🛡 DEFENDER</button><button class="btn mp-turn-action" ${mine ? '' : 'disabled'} onclick="MP.coopAction('heal')">✚ CURAR ALIADO</button>`;
    else actions = `<button class="btn mp-turn-action" ${this.host ? '' : 'disabled'} onclick="MP.startRun()">INICIAR NOVA EXPEDIÇÃO</button>`;
    const turns = mine ? 'É o seu turno.' : `Turno de ${escapeHtml(currentName)}.`;
    G.modal('EXPEDIÇÃO COOPERATIVA', `<div class="mp-coop-screen">
      <div class="mp-coop-banner"><span>REGIÃO ${r.stage}/3 · ETAPA ${r.step}</span><strong>${phaseLabel}</strong></div>
      <p class="mp-turn-hint ${mine ? 'is-mine' : ''}">${turns}</p>
      ${enemy}
      <div class="mp-party-grid">${members || '<p>Esperando aventureiros.</p>'}</div>
      <div class="mp-coop-log"><small>RELATO DO GRUPO</small><p>${escapeHtml(r.log || 'O caminho continua entre as ruínas.')}</p></div>
      <div class="mp-coop-actions">${actions}</div>
      <p class="mp-note">As ações e o combate desta expedição são validados pelo servidor. Os saves da sua run solo permanecem separados desta aventura cooperativa.</p>
      <div class="row"><button class="btn" onclick="MP._coopWindowOpen=false;G.closeModal()">FECHAR PAINEL</button><button class="btn" onclick="MP.onlinePanel()">AMIGOS & CONVITES</button></div>
    </div>`);
  };

  MP.renderRunPanel = function () {
    const r = this._roomRun;
    const status = r ? `Expedição ${String(r.runId).slice(-6)} · região ${r.stage}/3 · etapa ${r.step} · ${r.phase}` : 'Nenhuma expedição cooperativa iniciada.';
    const node = $('mp-run-status'); if (node) node.textContent = status;
    const log = $('mp-run-log'); if (log) log.textContent = r?.log || 'Entre em uma sala com um amigo e inicie a expedição.';
    const open = $('mp-open-run'); if (open) open.disabled = !r;
  };

  MP.ensureRunForCoop = function () {
    if (typeof G !== 'undefined' && G.s && G.runActive) return true;
    if (localStorage.getItem('solrng_save') && typeof G.load === 'function') {
      if (G.load() && G.s) return true;
    }
    const starter = CHARS.find(c => c.id === 'campones') || CHARS[0];
    if (!starter) throw new Error('Não consegui preparar uma partida inicial. Atualize a página.');
    G.diff = 'medium';
    G.start(starter);
    return true;
  };

  MP.createRoom = async function () {
    try {
      await this.ensureClient();
      this.ensureRunForCoop();
      this.roomStatus = 'Criando sala…';
      this.onlinePanel('Criando uma sala segura para o seu grupo…');
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('O servidor não respondeu ao criar a sala.')), 9000);
        this.socket.emit('room_create', { player: this.localPlayerPayload() }, response => {
          clearTimeout(timer);
          resolve(response || { ok: false, error: 'Não foi possível criar a sala.' });
        });
      });
      if (!result.ok) throw new Error(result.error || 'Não foi possível criar a sala.');
      this.room = result.code;
      this._joiningRoom = null;
      this.host = true;
      this.players = result.players || [];
      this._roomRun = result.run || this._roomRun;
      this.battle = result.battle || this.battle;
      this.roomStatus = 'Conectado';
      this.channel = { untrack: async () => this.socket?.emit('room_leave') };
      this.renderRoster();
      await this.copyRoom();
    } catch (error) {
      this.onlinePanel(error.message || 'Não foi possível criar a sala.');
    }
  };

  MP.joinRoom = async function (code, _host = false) {
    try {
      await this.ensureClient();
      this.ensureRunForCoop();
      code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Digite o código de 6 letras/números que seu amigo compartilhou.');
      this._joiningRoom = code;
      this.roomStatus = 'Entrando na sala…';
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('O servidor não respondeu ao entrar na sala.')), 9000);
        this.socket.emit('room_join', { code, player: this.localPlayerPayload() }, response => {
          clearTimeout(timer);
          resolve(response || { ok: false, error: 'Não foi possível entrar na sala.' });
        });
      });
      this._joiningRoom = null;
      if (!result.ok) throw new Error(result.error || 'Não foi possível entrar na sala.');
      this.room = result.code;
      this.host = result.hostId === this.user.id;
      this.players = result.players || [];
      this._roomRun = result.run || this._roomRun;
      this.battle = result.battle || this.battle;
      this.roomStatus = 'Conectado';
      this.channel = { untrack: async () => this.socket?.emit('room_leave') };
      this.renderRoster();
      this.renderRunPanel();
      this.onlinePanel(`Você entrou na sala ${this.room}. O grupo está pronto para se aventurar.`);
    } catch (error) {
      this._joiningRoom = null;
      this.onlinePanel(error.message || 'Não foi possível entrar na sala.');
    }
  };

  MP.updatePresence = async function () {
    if (!this.socket?.connected || !this.room || !this.user) return;
    this.socket.emit('player_update', this.localPlayerPayload());
  };

  MP.refreshRoster = function () { this.renderRoster(); };
  MP.renderRoster = function () {
    const el = $('mp-roster');
    if (el) {
      el.innerHTML = this.players.map(p => `<div class="mp-player"><span class="mp-online"></span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(CHARS.find(c => c.id === p.classId)?.n || p.classId || 'Aventureiro')} · ${escapeHtml(p.role || 'Aventureiro')}${p.userId === this.user?.id ? ' · Você' : ''}</small></div>`).join('') || '<p>Aguardando jogadores… Compartilhe o convite para começar.</p>';
    }
    const status = $('mp-room-status');
    if (status) status.textContent = this.room ? `Sala ${this.room} · ${this.players.length}/3 jogadores · ${this.roomStatus}${this.host ? ' · anfitrião' : ''}` : 'Nenhuma sala conectada.';
    const create = $('mp-create-room');
    if (create) create.disabled = !this.user;
    const join = $('mp-join-room');
    if (join) join.disabled = !this.user;
    const copy = $('mp-copy');
    if (copy) copy.disabled = !this.room;
    const startRun = $('mp-start-run');
    if (startRun) startRun.disabled = !(this.host && this.players.length >= 2);
    const openRun = $('mp-open-run');
    if (openRun) openRun.disabled = !this._roomRun;
    this.renderRunPanel();
  };

  MP.send = async function (type, data = {}) {
    if (!this.socket?.connected || !this.room) throw new Error('Entre em uma sala antes de agir.');
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O servidor não respondeu. Tente novamente.')), 8000);
      this.socket.emit('coop_send', { payload: { type, ...data } }, response => {
        clearTimeout(timer);
        if (!response?.ok) { if (response?.run) this._roomRun = response.run; resolve(response || { ok: false, error: 'Ação recusada pelo servidor.' }); return; }
        if (response.run) this._roomRun = response.run;
        resolve(response);
      });
    });
  };

  MP.leaveRoom = async function () {
    if (this.socket?.connected && this.room) this.socket.emit('room_leave');
    this.channel = null;
    this.room = null;
    this.host = false;
    this.players = [];
    this.battle = null;
    this._roomRun = null;
    this.roomStatus = 'Offline';
    this.onlinePanel('Você saiu da sala. A sua partida local continua disponível.');
  };

  MP.copyRoom = async function () {
    if (!this.room) return;
    const hostname = location.hostname.toLowerCase();
    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(hostname);
    const isPrivateIPv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
    if (isLoopback) {
      let copied = false;
      try { await navigator.clipboard.writeText(this.room); copied = true; } catch (_) { copied = false; }
      const input = $('mp-invite-link');
      if (input) { input.value = this.room; input.focus(); input.select(); }
      this.onlinePanel(copied
        ? `Código ${this.room} copiado. Para jogar na mesma Wi-Fi, seu amigo deve abrir http://IP-DO-SEU-PC:5000 e digitar esse código. Para enviar um link direto, abra o jogo pelo IP da rede antes de criar a sala.`
        : `Código da sala: ${this.room}. Para jogar na mesma Wi-Fi, seu amigo deve abrir http://IP-DO-SEU-PC:5000 e digitar esse código.`);
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set('room', this.room);
    const invite = url.toString();
    let copied = false;
    try { await navigator.clipboard.writeText(invite); copied = true; } catch (_) { copied = false; }
    const reachability = isPrivateIPv4 ? ' Esse link funciona apenas na mesma rede Wi-Fi/LAN; para um amigo em outro estado, publique o servidor em HTTPS.' : '';
    this.onlinePanel(copied ? `Link de convite copiado! Envie para seu amigo: ${this.room}.${reachability}` : `Copie o link no campo de convite abaixo e envie aos seus amigos.${reachability}`);
    const input = $('mp-invite-link');
    if (input) { input.value = invite; input.focus(); input.select(); }
  };

  MP.setAuthMode = function (mode) {
    this.authMode = mode === 'signup' ? 'signup' : 'signin';
    this.onlinePanel();
  };

  MP.onlinePanel = function (message = '') {
    if (message) this.notice = message;
    const connected = !!this.user;
    const _hostname = location.hostname.toLowerCase();
    const inviteIsLocal = ['localhost', '127.0.0.1', '::1'].includes(_hostname);
    const inviteIsPrivate = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(_hostname);
    const inviteUrl = this.room && !inviteIsLocal ? (() => { const u = new URL(location.href); u.searchParams.set('room', this.room); return u.toString(); })() : '';
    const account = connected ? `
      <div class="mp-status"><span class="mp-online"></span><strong>Conectado como ${escapeHtml(this.user.username || this.user.email)}</strong><small>${escapeHtml(this.user.email || '')}</small><small>Seu progresso é salvo na conta automaticamente.</small></div>
      <div class="row"><button class="btn" onclick="MP.syncCloudSave().then(()=>MP.onlinePanel('Progresso sincronizado com sucesso.')).catch(e=>MP.onlinePanel(e.message))">SALVAR AGORA</button><button class="btn" onclick="MP.logout()">SAIR DA CONTA</button></div>` : `
      <div class="mp-auth-tabs"><button class="${this.authMode === 'signin' ? 'selected' : ''}" onclick="MP.setAuthMode('signin')">ENTRAR</button><button class="${this.authMode === 'signup' ? 'selected' : ''}" onclick="MP.setAuthMode('signup')">CRIAR CONTA</button></div>
      <div class="mp-config">
        ${this.authMode === 'signup' ? '<label>NOME NO JOGO<input id="mp-name" maxlength="24" autocomplete="nickname" placeholder="Como seus amigos vão te ver" value="' + escapeHtml(this.nameDraft) + '"></label>' : ''}
        <label>E-MAIL<input id="mp-email" type="email" maxlength="254" autocomplete="email" placeholder="voce@exemplo.com" value="${escapeHtml(this.emailDraft)}"></label>
        <label>SENHA<input id="mp-password" type="password" minlength="8" maxlength="200" autocomplete="${this.authMode === 'signup' ? 'new-password' : 'current-password'}" placeholder="${this.authMode === 'signup' ? 'Pelo menos 8 caracteres' : 'Sua senha'}"></label>
        <button class="btn mp-primary" onclick="MP.auth('${this.authMode}')">${this.authMode === 'signup' ? 'CRIAR CONTA E ENTRAR' : 'ENTRAR NO JOGO'}</button>
        <p>${this.authMode === 'signup' ? 'Sem confirmação por e-mail: a conta entra automaticamente. Use uma senha que você não usa em outros sites.' : 'Seu save fica vinculado à sua conta, mesmo que você troque de computador.'}</p>
      </div>`;
    G.modal('CONTA & COOP ONLINE', `
      <div class="mp-status"><span class="mp-online ${connected ? '' : 'offline'}"></span><strong>${connected ? 'Conta conectada' : 'Entre para jogar com seus amigos'}</strong><small>${escapeHtml(this.notice || (connected ? this.roomStatus : 'Crie a conta uma vez e use o mesmo e-mail para entrar depois.'))}</small></div>
      ${account}
      ${connected ? (() => {
        const d = this.friendsData || {friends:[], incoming:[], outgoing:[]};
        const friendCard = f => `<div class="mp-player"><strong>${escapeHtml(f.username)}</strong><small>${escapeHtml(f.email || '')}</small><div class="row"><button class="btn" onclick="MP.inviteFriend('${escapeHtml(f.id)}')">CONVIDAR</button><button class="btn" onclick="MP.removeFriend('${escapeHtml(f.id)}')">REMOVER</button></div></div>`;
        const roomInvites = (d.roomInvites || []).map(inv => `<div class="mp-player"><strong>${escapeHtml(inv.sender_username || 'Amigo')}</strong><small>Sala ${escapeHtml(inv.room_code)} · convite recebido</small><div class="row"><button class="btn" onclick="MP.joinInvite(${Number(inv.id)},'${escapeHtml(inv.room_code)}')">ENTRAR NA PARTIDA</button><button class="btn" onclick="MP.dismissRoomInvite(${Number(inv.id)})">IGNORAR</button></div></div>`).join('');
        return `<section class="mp-friends"><div class="h">AMIGOS & CONVITES</div><p class="mp-note">Adicione pelo nome exato. Convites de amizade e convites de partida ficam guardados na conta.</p><div class="row"><label class="sr-only" for="mp-friend-name">Nome do amigo</label><input id="mp-friend-name" maxlength="24" placeholder="NOME DO JOGADOR"><button class="btn" onclick="MP.addFriend()">ADICIONAR</button></div><div><strong>Convites para jogar (${(d.roomInvites || []).length})</strong>${roomInvites || '<p class="mp-note">Nenhum convite de partida pendente.</p>'}</div><div class="mp-friends-grid"><div><strong>Lista de amigos (${d.friends.length})</strong>${d.friends.map(friendCard).join('') || '<p class="mp-note">Nenhum amigo adicionado ainda.</p>'}</div><div><strong>Convites de amizade (${d.incoming.length})</strong>${d.incoming.map(f => `<div class="mp-player"><strong>${escapeHtml(f.username)}</strong><div class="row"><button class="btn" onclick="MP.respondFriend(${Number(f.id)},'accept')">ACEITAR</button><button class="btn" onclick="MP.respondFriend(${Number(f.id)},'decline')">RECUSAR</button></div></div>`).join('') || '<p class="mp-note">Nenhum convite recebido.</p>'}</div></div><div><strong>Convites de amizade enviados (${d.outgoing.length})</strong>${d.outgoing.map(f => `<div class="mp-player"><strong>${escapeHtml(f.username)}</strong><small>Aguardando resposta</small></div>`).join('') || '<p class="mp-note">Nenhum convite enviado.</p>'}</div><button class="btn" onclick="MP.refreshFriends().then(()=>MP.onlinePanel('Lista de convites atualizada.')).catch(e=>MP.onlinePanel(e.message))">ATUALIZAR AMIGOS & CONVITES</button></section>`;
      })() : ''}
      <hr style="border-color:var(--line)">
      <div class="mp-room">
        <div class="h">JOGAR JUNTO · ATÉ 3 JOGADORES</div>
        <p class="mp-note">Crie uma sala e convide seus amigos. ${inviteIsLocal ? 'Como você está usando localhost, amigos na mesma Wi-Fi devem abrir o IP deste computador na porta 5000 e digitar o código. Para um link direto, abra o jogo usando o IP da rede antes de criar a sala.' : 'Envie o link: seu amigo entra ou cria a conta e é encaminhado direto para a sala.'}</p>
        <div id="mp-room-status">${this.room ? `Sala ${this.room} · ${this.players.length}/3 jogadores` : 'Nenhuma sala conectada.'}</div>
        <div class="row"><button id="mp-create-room" class="btn" ${connected ? '' : 'disabled'} onclick="MP.createRoom()">CRIAR SALA + CONVITE</button></div>
        <div class="row"><input id="mp-code" maxlength="6" placeholder="CÓDIGO DA SALA" value="${escapeHtml(this.room || '')}" aria-label="Código da sala"><button id="mp-join-room" class="btn" ${connected ? '' : 'disabled'} onclick="MP.joinRoom($('mp-code').value,false)">ENTRAR NA SALA</button></div>
        ${this.room ? `<label class="mp-invite-label">${inviteIsLocal ? 'CÓDIGO DA SALA' : (inviteIsPrivate ? 'LINK DA REDE LOCAL' : 'LINK PARA OS AMIGOS')}<input id="mp-invite-link" readonly value="${escapeHtml(inviteIsLocal ? this.room : inviteUrl)}" onclick="this.select()"></label><button id="mp-copy" class="btn" onclick="MP.copyRoom()">${inviteIsLocal ? 'COPIAR CÓDIGO DA SALA' : 'COPIAR LINK DE CONVITE'}</button>` : '<p class="mp-note">Você pode criar ou entrar na sala sem configurar chaves nem serviços externos.</p>'}
        <div id="mp-roster" class="mp-roster">${this.players.map(p => `<div class="mp-player"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.classId || 'Aventureiro')}</small></div>`).join('') || '<p>A sala mostrará aqui quem estiver conectado.</p>'}</div>
        <section class="mp-run-card"><div class="h">EXPEDIÇÃO COOPERATIVA</div><p class="mp-note">Explorem, coletem materiais, descansem e lutem juntos. Cada jogador tem seu turno; o servidor calcula o combate e as recompensas.</p><strong id="mp-run-status">${this._roomRun ? `Expedição ${escapeHtml(String(this._roomRun.runId).slice(-6))} · região ${this._roomRun.stage}/3 · etapa ${this._roomRun.step}` : 'Nenhuma expedição iniciada.'}</strong><p id="mp-run-log" class="mp-note">${escapeHtml(this._roomRun?.log || 'Entre em uma sala com um amigo e inicie a expedição.')}</p><button id="mp-start-run" class="btn" ${this.host && this.players.length >= 2 ? '' : 'disabled'} onclick="MP.startRun()">INICIAR EXPEDIÇÃO EM EQUIPE</button><button id="mp-open-run" class="btn" ${this._roomRun ? '' : 'disabled'} onclick="MP.openCoopRun()">ABRIR EXPEDIÇÃO</button></section>
        ${this.room ? '<button class="btn" onclick="MP.leaveRoom()">SAIR DA SALA</button>' : ''}
      </div>
      <button class="btn" onclick="G.closeModal()">VOLTAR AO JOGO</button>`);
    this.renderRoster();
  };

  MP.receive = async function (packet) {
    if (!packet || packet.from === this.user?.id) return;
    if (packet.type === 'boss_start') { this.battle = packet.battle; this.showBoss(); }
    else if (packet.type === 'boss_state') { this.battle = packet.battle; this.showBoss(); this.applyLocalPlayerState(); }
    else if (packet.type === 'boss_end') { this.battle = packet.battle || this.battle; this.showBoss(); if (packet.won) this.applyCoopRewards(packet.reward || 0); }
    else if (packet.type === 'run_start' || packet.type === 'run_state') {
      this._roomRun = packet.run || this._roomRun;
      this.renderRunPanel();
      this.notice = packet.type === 'run_start' ? 'A expedição compartilhada começou.' : (this._roomRun?.log || 'A expedição avançou.');
      if (this._coopWindowOpen) this.openCoopRun();
    } else if (packet.type === 'player_action' && this.host) {
      // Host-side action dispatcher retained temporarily for the legacy boss combat.
      this.handleHostAction(packet.from, packet.action);
    }
  };

  MP.showBoss = function () {
    if (typeof G === 'undefined' || typeof G.modal !== 'function') return;
    G.modal('CHEFE COOPERATIVO', `<p class="mp-note">O combate cooperativo legado continua disponível, mas ainda depende de validação de servidor antes de uma publicação pública.</p><button class="btn" onclick="G.closeModal()">VOLTAR</button>`);
  };

  MP.startBoss = async function () {
    this.onlinePanel('O combate cooperativo antigo está em transição para a run compartilhada. Use INICIAR RUN EM EQUIPE para iniciar a expedição.');
  };

  MP.applyLocalPlayerState = function () {};
  MP.applyCoopRewards = function () {};
  MP.handleHostAction = function () {};

  // Flush do último save ao fechar a aba, para reduzir a chance de perder a última alteração.
  window.addEventListener('pagehide', () => {
    try {
      if (typeof G !== 'undefined' && G.s && G.runActive) G.save(false);
      if (MP.user && MP.client) {
        const body = JSON.stringify({ save: localStorage.getItem('solrng_save'), meta: localStorage.getItem('solrng_meta') });
        fetch('/api/save', { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
      }
    } catch (_) {}
  });

  // Evita recarregar configuração de serviços de terceiros; tudo usa o servidor deste projeto.
  G.multiplayer = function () { if (MP.channel) MP.updatePresence(); if (MP.user) MP.refreshFriends().then(()=>MP.onlinePanel()).catch(()=>MP.onlinePanel()); else MP.onlinePanel(); };
  MP.openAccount = function(mode='signin') { this.authMode = mode === 'signup' ? 'signup' : 'signin'; this.onlinePanel(); };

  let knownRoomInvites = new Set();
  setInterval(async () => {
    if (!MP.user || document.hidden) return;
    try {
      const data = await MP.refreshFriends();
      const current = new Set((data.roomInvites || []).map(x => String(x.id)));
      const added = (data.roomInvites || []).filter(x => !knownRoomInvites.has(String(x.id)));
      knownRoomInvites = current;
      if (added.length) {
        const names = added.map(x => x.sender_username || 'um amigo').slice(0, 2).join(' e ');
        MP.notice = `Novo convite de partida de ${names}. Abra Amigos & Jogar Online para aceitar.`;
        const front = $('front-account-state'); if (front) front.textContent = MP.notice;
        if (typeof G.say === 'function' && G.s && !$('play').classList.contains('hidden')) G.say('Mensageiro', MP.notice);
      }
    } catch (_) {}
  }, 15000);

  window.addEventListener('load', async () => {
    try {
      const result = await api('/api/me');
      if (result.user) {
        MP.user = result.user;
        MP.client = { backend: 'Sols RNG server' };
        await MP.ensureSocket();
        await MP.afterLogin({ fromBoot: true });
        const front = $('front-account-state'); if (front) front.textContent = `Você está conectado como ${MP.user.username}. Seu progresso pode acompanhar sua conta.`;
      }
      const invite = new URLSearchParams(location.search).get('room');
      if (invite && !MP.user) {
        MP.notice = `Você recebeu um convite para a sala ${invite}. Entre ou crie uma conta para continuar.`;
        MP.authMode = 'signin';
        MP.onlinePanel(MP.notice);
      }
      knownRoomInvites = new Set((MP.friendsData.roomInvites || []).map(x => String(x.id)));
      const accountState = $('front-account-state');
      if (accountState) accountState.textContent = MP.user
        ? `Você está conectado como ${MP.user.username}. Seu progresso pode acompanhar sua conta.`
        : (invite ? 'Você foi convidado para uma partida. Entre ou crie uma conta abaixo.' : 'Crie sua conta ou entre para salvar o progresso e jogar com amigos.');
      MP.showAccountGate(!MP.user, invite ? `Você foi convidado para a sala ${invite}. Entre ou crie sua conta para aceitar.` : 'Entre ou crie uma conta para começar a jogar.');
      const appTitle = document.querySelector('title');
      if (appTitle) appTitle.textContent = "Sol's RNG — Dark Fantasy";
    } catch (_) {
      MP.notice = 'Não consegui alcançar o servidor local. Confira se a janela do servidor continua aberta.';
      const invite = new URLSearchParams(location.search).get('room');
      MP.showAccountGate(true, 'O servidor não respondeu. Inicie o jogo pelo run_windows.bat e tente novamente.');
      if (invite) MP.onlinePanel(MP.notice);
    }
  });
})();
