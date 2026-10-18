Sol's RNG - Dark Fantasy v12: processo de build do instalador

Para gerar o instalador de Windows de dentro desta pasta do projeto:
1. Instale Python 3.11+ e Node.js 24 LTS+.
2. Dê dois cliques em build_windows_installer.bat.
3. Aguarde instalar as dependências e concluir o build.
4. O instalador estará em release\SolsRNGDarkFantasy-Setup-0.12.0.exe.

A compilação requer conexão com a internet para baixar os pacotes Python e Node/Electron. O jogador que receber o instalador não precisa instalar Python ou Node.
Os saves e a conta local são guardados em %LOCALAPPDATA%\SolsRNGDarkFantasy.
O instalador desktop cria uma janela própria do jogo e inicia o backend local automaticamente.
O multiplayer entre estados ainda exige que o backend de sala esteja publicado num servidor público HTTPS. O instalador local não publica o servidor na internet.
