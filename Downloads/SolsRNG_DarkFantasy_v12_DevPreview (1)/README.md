# Sol's RNG — Dark Fantasy (servidor)

Este pacote mantém o jogo original e muda a camada de conta/coop: agora o cadastro e o login são feitos diretamente no servidor, o progresso fica ligado à conta, e os amigos entram na mesma sala por código ou link de convite. O projeto não exige URL/chave do Supabase.

## Criar atalho na Área de Trabalho

Depois de extrair a pasta inteira, dê clique com o botão direito em `Criar_Atalho_Windows.ps1` e escolha **Executar com PowerShell**. O script cria um atalho chamado `Sol's RNG - Dark Fantasy` na Área de Trabalho, usando o ícone do jogo. Esse atalho abre o iniciador local; a primeira execução ainda precisa baixar as dependências Python e a janela do servidor precisa permanecer aberta.

Se a política do Windows bloquear a execução do script, abra o PowerShell na pasta extraída e execute `powershell -ExecutionPolicy Bypass -File .\Criar_Atalho_Windows.ps1`. Execute somente o script que veio dentro desta pasta do projeto.

## Iniciar no Windows

1. Instale o **Python 3.11 ou mais recente** se ainda não estiver instalado.
2. Extraia a pasta inteira do ZIP para um local normal do computador.
3. Dê dois cliques em `run_windows.bat`.
4. Na primeira execução, o arquivo instala as dependências automaticamente. Quando o navegador abrir, acesse `http://127.0.0.1:5000`.
5. Deixe a janela preta do servidor aberta enquanto joga. Ela não é um erro: é o servidor funcionando.

No jogo, abra **CONTA & COOP ONLINE**. Crie uma conta com nome no jogo, e-mail e senha de pelo menos 8 caracteres. Depois de iniciar/carregar uma run, use **CRIAR SALA + CONVITE** e envie o link copiado ao seu amigo. Cada jogador precisa ter sua própria conta.

## Jogar na mesma rede Wi-Fi

No computador que executa o servidor, descubra o endereço IPv4 da rede local (no Windows, `ipconfig`). Abra também `http://IP-DO-COMPUTADOR:5000` no computador anfitrião, entre na mesma conta e crie a sala por esse endereço — assim o link copiado aponta para o IP certo. Os outros jogadores abrem o link ou acessam `http://IP-DO-COMPUTADOR:5000` (por exemplo `http://192.168.1.25:5000`) e digitam o código da sala. Permita o Python na rede privada do Firewall do Windows, caso ele pergunte.

## Jogar com amigos pela internet

É necessário publicar **esta pasta inteira** em um servidor acessível pela internet. Não basta hospedar apenas o HTML, porque login, saves e salas dependem do Python e do Socket.IO. O `Dockerfile` está incluído para provedores que aceitam implantação por Docker.

Configure estas variáveis no servidor online:

- `SECRET_KEY`: um segredo aleatório longo e privado.
- `COOKIE_SECURE=1`: use em sites HTTPS.
- `DATABASE_PATH`: caminho para um banco SQLite em armazenamento persistente, por exemplo `/var/data/solsrng.sqlite3`.
- `PORT`: normalmente definido automaticamente pelo provedor.

**Importante:** o SQLite precisa ficar em disco persistente na hospedagem; não coloque senhas ou chaves secretas no HTML. Em uma hospedagem com sistema de arquivos temporário, contas e saves podem ser apagados quando o serviço reiniciar. Para o coop, mantenha uma única instância do servidor, pois a lista de salas fica na memória desse processo.

## Dados guardados

- `data/solsrng.sqlite3`: usuários, hashes das senhas e saves por conta.
- `static/game.html`: o jogo completo entregue pelo usuário com o cliente do servidor integrado.
- `static/server_bridge.js`: a camada de conta, save na nuvem e coop; fica separada para facilitar manutenção.
- `game_original_backup.html`: cópia intacta do HTML que foi enviado originalmente.

As senhas nunca são guardadas em texto puro; o servidor armazena hashes. O progresso local existente é importado para a conta ao criar uma conta neste navegador.

## Resolução de problemas

- Se `python` não for reconhecido, instale Python e marque a opção para adicioná-lo ao PATH; depois execute `run_windows.bat` novamente.
- Se a página não abrir, confirme que a janela do servidor continua aberta e tente `http://127.0.0.1:5000`.
- Se o firewall bloquear conexões na rede Wi-Fi, autorize o Python na rede privada.
- Para verificar se o servidor está respondendo, abra `http://127.0.0.1:5000/healthz`; deve aparecer `status: ok`.


## Ciclo de desenvolvimento v10 (protótipo de amigos e expedição)

Esta versão adiciona uma lista de amigos persistente com pedido/aceitação/recusa por nome de jogador e uma sala de expedição compartilhada que sincroniza a etapa/estado de grupo entre participantes. A tela de conta continua dentro do jogo; não há chaves externas para preencher.

**Limite atual importante:** o estado de expedição cooperativa já é sincronizado, mas ainda não é uma run completa compartilhada. Movimento, rolagens/loot, encontros comuns, compra/uso de itens, morte/ressurreição, avanço de região e recompensas ainda não foram completamente movidos para uma simulação autoritativa no servidor. O antigo combate de chefe foi desligado nesta versão de trabalho até que suas ações e recompensas possam ser calculadas e validadas no servidor. Não publique este pacote como jogo online público antes da conclusão e teste dessa migração.

### Segurança/implantação

- Em modo `APP_ENV=production`, o servidor se recusa a iniciar se `SECRET_KEY` não tiver pelo menos 32 caracteres. Gere um segredo privado aleatório e defina `COOKIE_SECURE=1` em HTTPS.
- As salas continuam em memória de um único processo; reiniciar o processo encerra salas e expedições ativas. Usuários, amizades e saves ficam no SQLite.
- O cliente ainda envia snapshots para o save e precisa de validação de esquema/estratégia de conflito antes de produção.

### Próximos testes necessários

1. Criar duas contas distintas; enviar convite de amizade; aceitar/recusar; confirmar persistência após login novamente.
2. Criar sala, entrar com outro usuário, iniciar expedição e verificar que ambos veem o mesmo passo e região.
3. Reiniciar servidor e confirmar o comportamento documentado: contas/amigos/saves persistem, salas não.
4. Testar modo móvel, teclado, escalonamento de texto e carregamento com e sem rede.
5. Projetar e implementar combate compartilhado autoritativo (ações/turnos/HP/MP/loot/recompensas calculados pelo servidor) antes de reativar chefes cooperativos.


## Ciclo de desenvolvimento v11 (entrada, exploração e presságios)

- A tela inicial prioriza **CRIAR CONTA** e **ENTRAR NA CONTA**; esses comandos abrem diretamente o formulário de autenticação.
- A run apresenta instruções de movimento (**A/D** ou setas), interação (**E**) e busca de recursos (**Espaço** ou botão). A exploração agora mostra mensagens e pode revelar eventos de mundo sem iniciar uma batalha a cada clique.
- Os sinais do reino não mostram mais a contagem exata de vitórias até o chefe. O jogo usa presságios; a criatura é revelada quando o encontro começa.
- A camada procedural de bioma foi tornada translúcida sobre a arte de cenário existente, e a animação do jogador recebeu uma passada mais legível. É uma melhoria incremental: ainda não substitui os sprites atuais por um tileset artístico inteiramente novo.
- O menu de pausa já traz **SALVAR JOGO** e **SALVAR E SAIR**; para uma conta conectada, o segundo aguarda a sincronização online antes de sair. Sem conexão, não prossiga se precisar garantir o save na nuvem.

### Limite importante para convites remotos

A URL `http://192.168.x.x:5000` vista em um computador é um endereço privado da rede local. Uma pessoa de outro estado não conseguirá acessá-la. O amigo poderá baixar este ZIP e instalar o cliente, mas para jogar pela internet o servidor precisa estar publicado num hostname acessível publicamente via HTTPS, com `SECRET_KEY` de produção e armazenamento persistente. Não basta enviar o arquivo HTML; esta versão **não foi publicada na internet**.

O painel de amigos cria convites direcionados à conta amiga e links de sala, mas a sincronização cooperativa ainda compartilha apenas o estado básico da expedição. O combate, movimento, recompensas e loot não são todos calculados em servidor; este pacote continua sendo uma prévia de desenvolvimento, não um lançamento público.

### Testes para concluir este ciclo

1. Abrir a página sem sessão e confirmar que os botões de conta aparecem primeiro.
2. Criar conta, sair e entrar; confirmar que o save e os dados de conta estão associados ao jogador certo.
3. Salvar e sair da run, reabrir e confirmar posição/estado.
4. Testar exploração por teclado e clique, eventos por tecla E e avisos narrativos sem contador do chefe.
5. Fazer o teste de duas contas após a implantação pública; verificar convite aceito, entrada na sala, reconexão e saída.
6. Antes da publicação, migrar os estados de combate e recompensas para a autoridade do servidor e executar testes de abuso/concorrência.


## Ciclo de desenvolvimento v12 — expedição de equipe e desktop

Esta versão amplia a expedição cooperativa para ações de jogo calculadas no servidor: explorar, coletar materiais, descansar, atacar, usar magia, defender e curar um aliado. O servidor mantém os turnos, HP/MP, inimigo, dano, recompensa, bolsa de materiais e progressão entre três regiões. O chefe aparece por eventos do encontro e não por um contador mostrado ao jogador. As recompensas da expedição cooperativa são separadas do save da run solo para não sobrescrever silenciosamente os dados pessoais.

A tela de entrada de conta é exibida antes do menu do jogo. O painel de conta não deve abrir automaticamente após o login comum; assim o jogador pode seguir para o menu. Convites de sala recebidos são atualizados periodicamente enquanto a sessão está ativa.

O cenário `static/ruins_background.svg` é um novo fundo em camadas de ruínas, bosque, aldeia, ponte, água, lua e lanternas, usado para substituir parte do fundo procedimental excessivamente plano. O desenho é original e não copia assets de outro jogo.

### Criar um instalador nativo do Windows

O projeto agora inclui o wrapper Electron em `desktop/` e o script `build_windows_installer.bat`. Para gerar o instalador:

1. Em um PC Windows de desenvolvimento, instale Python 3.11+ e Node.js 24 LTS+.
2. Extraia a pasta inteira e execute `build_windows_installer.bat`.
3. Aguarde o script instalar dependências, copiar o cliente Socket.IO para `static/`, empacotar o servidor Python com PyInstaller e gerar o instalador Electron/NSIS.
4. Procure `release/SolsRNGDarkFantasy-Setup-0.12.0.exe`.

O instalador gera uma janela própria de jogo, ícone e atalhos no Desktop/Menu Iniciar. Ao abrir, o jogador escolhe **Jogar localmente** ou **Jogar online com amigos**; o último endereço HTTPS usado fica salvo e pré-preenchido na próxima inicialização. O jogador final não precisa instalar Python nem Node. O save e a chave local persistente do aplicativo ficam em `%LOCALAPPDATA%\\SolsRNGDarkFantasy`. A versão de código-fonte desta entrega contém os scripts de build; o `Setup.exe` pré-compilado não foi gerado neste ambiente Linux/offline.

### Publicar para jogar entre estados

O instalador de desktop roda o jogo e o backend local na máquina do jogador, mas isso não o torna automaticamente um servidor público. Para amigos de outras regiões, publique uma instância de `app.py` em uma hospedagem acessível via HTTPS. O repositório contém `render.yaml` para criar um Web Service Docker com disk persistente; para usar Render, envie o projeto a um repositório Git e crie um Blueprint com esse arquivo (a configuração escolhe um plano Starter pago para permitir o disk). Também é possível configurar a hospedagem manualmente. Use `SECRET_KEY` privada (32+ caracteres), `COOKIE_SECURE=1`, `PORT` da plataforma e `DATABASE_PATH` no armazenamento persistente. Mantenha uma única instância enquanto as salas estiverem em memória. Depois da publicação, todos os jogadores escolhem **Jogar online com amigos** no instalador e digitam a mesma URL HTTPS. O convite direto usa essa URL pública; links `192.168.x.x` continuam restritos à rede local.

### Verificação deste ciclo

- `app.py` passou em `py_compile`.
- `static/server_bridge.js` passou em `node --check`.
- Os 12 blocos JavaScript embutidos em `static/game.html` passaram em verificações sintáticas.
- `test_shared_run.py` passou nos checks da lógica compartilhada: criação da run, recusa fora de turno, coleta, retaliação ao final da rodada, recompensa no servidor, progressão de regiões/bosses, conclusão e pulo de jogador derrotado.
- `test_friend_schema.py` passou no teste isolado do SQLite: tabelas, restrição de autoamizade, persistência de convite e exclusão em cascata.
- A compilação do instalador Electron/NSIS depende de download de dependências e ambiente Windows; não foi executada aqui. Não foi possível concluir o teste em navegador neste ambiente porque o Chromium headless foi bloqueado por política do ambiente. Portanto, criação/login, multiplayer em duas sessões e UX em browser real ainda precisam de uma validação manual após instalar as dependências.

### Limites conhecidos

- O combate autoritativo do ciclo v12 existe para a **expedição cooperativa**; não substitui ainda todos os itens, lojas, habilidades e encontros do modo solo numa única simulação universal. Os saves dos dois modos permanecem separados intencionalmente.
- Salas são memória de uma única instância e expiram quando o processo reinicia; usuários, amizades e saves ficam em SQLite persistente.
- Não publicar uma instância pública sem teste completo de duas contas, rate-limiting de login, revisão de concorrência/saves e checklist de segurança.
