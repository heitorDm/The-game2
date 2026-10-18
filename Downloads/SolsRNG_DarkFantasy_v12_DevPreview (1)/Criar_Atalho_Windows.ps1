$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root 'run_windows.bat'
$icon = Join-Path $root 'static\sols-rng.ico'
$desktopBuildDir = Join-Path $root 'release\win-unpacked'
$desktopBuild = $null
if (Test-Path $desktopBuildDir) {
  $desktopBuild = Get-ChildItem -Path $desktopBuildDir -Filter '*.exe' -File | Where-Object { $_.Name -notmatch 'uninstaller|setup' } | Select-Object -First 1
}
if (-not (Test-Path $icon)) { throw 'Não encontrei o ícone static\sols-rng.ico do jogo.' }
if ($desktopBuild) { $target = $desktopBuild.FullName; $args = ''; $work = $desktopBuildDir }
elseif (Test-Path $launcher) { $target = $env:ComSpec; $args = '/c ""' + $launcher + '""'; $work = $root }
else { throw 'Não encontrei a compilação desktop nem run_windows.bat. Extraia a pasta completa.' }
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop "Sol's RNG - Dark Fantasy.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($linkPath)
$shortcut.TargetPath = $target
$shortcut.Arguments = $args
$shortcut.WorkingDirectory = $work
$shortcut.IconLocation = $icon
$shortcut.Description = "Iniciar Sol's RNG - Dark Fantasy"
$shortcut.Save()
Write-Host "Atalho criado: $linkPath" -ForegroundColor Green
if (-not $desktopBuild) { Write-Host 'Este atalho usa o iniciador Python. Execute build_windows_installer.bat para criar o instalador com janela própria.' -ForegroundColor Yellow }
