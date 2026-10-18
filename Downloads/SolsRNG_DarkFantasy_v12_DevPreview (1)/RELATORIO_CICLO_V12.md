# Sol's RNG — Dark Fantasy · Relatório do ciclo v12

**Estado:** prévia de desenvolvimento; não é um lançamento público validado.

## O que foi implementado nesta cópia

### Conta antes do jogo

- O formulário de entrar/criar conta aparece como tela inicial, antes de poder interagir com a run.
- Cadastro e login continuam usando as rotas do servidor Python.
- Depois do login comum, a interface volta ao menu em vez de abrir automaticamente o painel de amigos.
- Se o servidor/API não responder, a tela mostra uma mensagem em vez de deixar o jogador presumir que está online.

### Expedição cooperativa

- O estado compartilhado é criado pelo servidor e mantém equipe, classe-base, HP/MP, turno atual, região, etapa, encontro, inimigo, log e recompensas.
- Ações suportadas: explorar, coletar, descansar, atacar, magia, defender e curar o aliado com menor proporção de HP.
- O servidor valida o turno atual, calcula dano/custo de mana/retaliação/recompensas, avança a região ao derrotar chefes e conclui depois da terceira região.
- Ações de estado completo enviadas pelo navegador não são usadas para autorizar dano ou recompensa.
- Jogadores derrotados ou que saem são removidos da fila de turno para que não deixem a partida travada.
- Convites são atualizados periodicamente e endereços IPv4 privados agora são identificados como links da rede local, não da internet pública.

### Arte, controles e interface

- `static/ruins_background.svg` contém cenário original em camadas: lua, citadela, bosque, aldeia, água, praça de pedra, ponte e lanternas.
- Camadas de bioma recebem tintas diferentes conforme a região/localização.
- O desenho procedural antigo fica translúcido sobre a arte para preservar personagens e interações existentes, enquanto reduz o efeito de retângulo plano.
- Cliques em regiões neutras do cenário caminham sem capturar cliques de controles e painéis; teclado de movimento/interação fica bloqueado enquanto a tela de conta está na frente.
- Pausa oferece `SALVAR E SAIR`, que salva localmente e espera a sincronização de nuvem antes de retornar ao menu. Se a nuvem falhar, mostra um aviso e não finge que a sincronização terminou.

### Executável e jogar entre estados

- `desktop/main.cjs` cria uma janela nativa Electron e inicia um backend Python empacotado quando o jogador escolhe modo local.
- Na abertura, o jogador pode escolher **Jogar localmente** ou **Jogar online com amigos**, informando a mesma URL HTTPS pública que os outros jogadores usam. A última URL pública fica pré-preenchida na próxima abertura.
- `build_windows_installer.bat` instala dependências de build, inclui cliente Socket.IO local, empacota o backend com PyInstaller e gera instalador Windows NSIS com ícone e atalhos.
- `render.yaml` descreve um serviço Docker com health check, segredo de produção gerado e disco persistente SQLite para deploy em Render. A configuração usa um plano Starter pago porque precisa do disco persistente.
- O Dockerfile respeita a variável `PORT` da plataforma.

## Verificações realizadas

| Verificação | Resultado |
|---|---|
| `python -m py_compile app.py` | Passou |
| `node --check static/server_bridge.js` | Passou |
| `node --check desktop/main.cjs` e `connect-preload.cjs` | Passaram |
| JavaScript inline no `static/game.html` | 12 blocos, zero erros de sintaxe |
| `desktop/package.json` | JSON válido |
| `render.yaml` | YAML válido; health check e disco persistente presentes |
| `static/ruins_background.svg` | XML válido |
| `test_shared_run.py` | Passou: criação, bloqueio fora de turno, coleta, retaliação, recompensas, progressão de regiões, conclusão e pulo de jogador derrotado |
| `test_friend_schema.py` | Passou: schema SQLite, autoamizade rejeitada, convite persistente e exclusão em cascata |
| Teste visual de navegador | Não concluído: Chromium headless foi bloqueado pela política do ambiente |
| Instalação/execução Flask, duas sessões Socket.IO e build final NSIS | Não executados: dependências não disponíveis para instalar neste ambiente offline e o build NSIS deve rodar no Windows com downloads habilitados |

Os testes de lógica cooperativa usam as funções extraídas do fonte e não substituem um teste de ponta a ponta com o servidor em execução.

## Como gerar o instalador

Em um PC Windows de desenvolvimento com Python 3.11+ e Node.js 24 LTS+, extraia este ZIP e execute `build_windows_installer.bat`. O artefato previsto é `release/SolsRNGDarkFantasy-Setup-0.12.0.exe`. O `Setup.exe` pré-compilado **não foi produzido aqui**.

## Como jogar online com amigos

1. Envie o projeto para um repositório Git privado.
2. No Render, crie um Blueprint a partir do repositório; ele lê `render.yaml`. Revise o plano/disk e conclua a criação.
3. Aguarde `/healthz` responder e copie a URL HTTPS pública do serviço.
4. Você e seus amigos abrem o instalador, escolhem **Jogar online com amigos** e usam a mesma URL.
5. Cada um cria a própria conta; aceitem a amizade, criem sala/convite e iniciem a expedição.

O arquivo `192.168.x.x` da rede local não é uma URL pública. Não compartilhar nem publicar um endereço privado como se servisse para alguém de outro estado.

## Limites ainda abertos

- A expedição cooperativa é jogável dentro do seu próprio sistema de combate, mas ainda não é a run solo inteira compartilhada. Itens, poderes, loja, progresso da run solo e loot cooperativo não foram unificados no mesmo modelo; a separação do save é intencional para evitar sobrescrever os dados solo sem migração.
- Salas e estado de expedição ficam em memória: após reinício do servidor as salas acabam; contas, amizades e saves ficam no SQLite persistente.
- Antes de abrir ao público: instalar dependências, testar criação/login/logout com duas contas, reconexão, duas partidas concorrentes, persistência após restart, segurança de sessão/convites, rate-limiting de autenticação e concorrência de saves.
