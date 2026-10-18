# Sol's RNG — Dark Fantasy | Relatório do ciclo v11

Data: 18/10/2026  
Base: pacote de desenvolvimento v10, trabalhando numa cópia. Os originais enviados não foram substituídos.

## Objetivos deste ciclo

Responder às falhas vistas na captura: cadastro escondido no painel online, affordance de “roll” dominante, pista exata do chefe e falta de clareza sobre convites entre redes diferentes.

## Alterações realizadas

1. **Entrada de conta na primeira tela:** os botões “Criar conta” e “Entrar na conta” estão na tela inicial, encaminhando para o modo correto de autenticação.
2. **Salvar e sair:** mantido e documentado o fluxo de pausa com “Salvar e sair”, que tenta sincronizar a conta antes de voltar ao menu. Save local continua distinto de confirmação de save remoto.
3. **Convites de sala:** convites persistentes aparecem na lista de amigos; agora cada convite recebido tem “Entrar na partida” e “Ignorar”. A rota DELETE exige login e só permite excluir convite dirigido ao usuário atual.
4. **Exploração de mundo:** o comando Explorar deixa de disparar uma batalha obrigatória toda vez. Alterna deslocamento pela cena, presságios e aparição de eventos/personagens. O movimento lateral existente continua acessível por A/D ou setas, com clique para caminhar e E para interagir.
5. **Menos click-and-roll:** o botão dominante passa a “Buscar materiais”; rolagem permanece disponível como uma ação contextual, sem ser o centro da interface. A faixa de reino comunica presságios em vez de mostrar a contagem numérica de vitórias até o chefe.
6. **Pixel art/cenário:** a camada procedural do bioma foi reduzida em opacidade e misturada com a cena principal para evitar que cubra a arte existente. O herói recebeu animação de passo/repouso com pixel stepping e instruções de controle visíveis.
7. **Documentação:** README e COMECE_AQUI atualizados com controles, save/quit e a limitação da rede privada.

## Limites e decisões técnicas

- Um endereço como `http://192.168.1.34:5000` é privado e alcança apenas o computador local/rede configurada. Não é uma URL pública. Para amigos em outro estado, o servidor precisa ser implantado num host público com HTTPS, segredo de sessão de produção e disco persistente; a implantação não foi feita nesta tarefa.
- Os convites são direcionados a contas amigas e salas em processo de servidor, mas as salas continuam em memória. Se o servidor reiniciar, salas ativas se perdem. Convites persistidos podem então apontar para uma sala que já não existe.
- A run cooperativa ainda não é totalmente compartilhada: fase e log básico são sincronizados; combate, ações, loot, recompensa, movimentação e resolução de eventos ainda não são todos validados/calculados no servidor. Não é seguro publicar este protótipo como um RPG online definitivo.
- A melhoria visual é incremental. Esta entrega não substitui os sprites existentes por um tileset/spritesheet artístico novo e animado. Um trabalho de arte completo deve definir resolução nativa, grelha de tiles, silhuetas, paletas por bioma, animações walk/idle/attack/hit/death e composição de camadas.
- O HTML tem muitos blocos/overrides legados. Foi evitada uma refatoração total numa única etapa para não quebrar muitos sistemas ao mesmo tempo.

## Verificações executadas

- `python -m py_compile app.py`: passou.
- `node --check static/server_bridge.js`: passou.
- Extração e `node --check` de todos os 9 scripts inline do `game.html`: passaram sem erros de sintaxe.
- Rota nova de remover convite revisada para autenticação, ownership e resposta 404 quando o convite não existe/pertence a outra conta.
- Teste visual Chromium headless: não concluiu neste ambiente (processo não finalizou e nenhum screenshot foi gerado); não considero isso evidência de funcionamento.
- Teste real do backend: não executado, pois Flask, Flask-SocketIO e Werkzeug não estão instalados no ambiente. Não instalei dependências para evitar mudanças fora do pacote do usuário.

## Critérios para o próximo ciclo

1. Instalar deps num ambiente de teste isolado e testar cadastro, login, logout, save local/cloud e persistência SQLite com duas contas.
2. Fazer testes com duas sessões socket simultâneas e convite recebido, aceito e ignorado.
3. Refatorar o jogo para uma única implementação por função antes de ampliar mais mecânicas.
4. Definir e implementar estado autoritativo da run no servidor: seed/loot, movimento e ações válidas, HP/MP, turno de combate, morte, recompensas e reconexão.
5. Fazer um pacote de arte real: tileset de floresta/ruínas/pântano/tundra, sprites do herói por direção, spritesheets de inimigos, animações em steps e parallax por plano. Referência atual é a captura enviada, cuja leitura revela cenário sobreposto, escala desbalanceada do personagem e CTA central grande demais.
6. Publicar com autorização do dono numa plataforma escolhida, com domínio/HTTPS, armazenamento persistente, backups, logs e política de atualização. Não utilizar port-forwarding do PC doméstico como solução padrão.
