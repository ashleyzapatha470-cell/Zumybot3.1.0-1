# ZUMY 3.1

Bot para grupos do WhatsApp. O WhatsApp privado não recebe respostas. O menu é interativo por comandos: zoom ou !menu abre o índice, !jogos, !musicas e !administracao abrem categorias diretamente e !menu completo exibe a lista inteira.

## Publicar no Render

1. Faça backup do repositório e dos arquivos da sessão do WhatsApp.
2. Coloque todos os arquivos deste pacote na raiz usada pelo Docker do serviço, na branch main. O processo inicia com npm start e usa a porta PORT do Render.
3. Crie ADMIN_TOKEN nas variáveis de ambiente do Render. Para manter sessão e regras entre deploys, use SESSION_DIR em um volume persistente. No serviço gratuito, o armazenamento local pode ser perdido quando a instância é substituída. O pacote não inclui a sessão anterior.
4. Use Manual Deploy → Deploy latest commit e confirme zumy-bot@3.1.0 nos logs.
5. Consulte /health. Com status conectado e funcoes ativas, envie !ping e !menu no grupo com outro participante. A conta vinculada também pode testar esses dois comandos.
6. Se o status for aguardando_pareamento, vincule a conta pelo código solicitado abaixo. Se for sessao_expirada, faça backup da pasta antiga e configure uma SESSION_DIR nova antes de pedir outro código.

## Vincular o WhatsApp

No navegador, abra /parear no endereço do próprio serviço do Render. Informe o ADMIN_TOKEN do serviço e toque em Gerar código. Digite o código no WhatsApp em Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone.

Para uso por API, faça POST /admin/pair com Authorization: Bearer SEU_ADMIN_TOKEN, Content-Type: application/json e o corpo {"number":"5511960649533"}. Quando o servidor retornar o código, abra WhatsApp → Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone e digite o código. Mantenha o token e o código privados. GET /admin/qr também disponibiliza o conteúdo do QR com o mesmo Bearer token. POST /admin/pause recebe {"paused":true} ou {"paused":false} com Bearer token.

## Comandos

- Para administrar participantes e apagar mensagens, torne o ZUMY administrador do grupo. !d apaga a mensagem citada. !add recebe um número com código do país, marcação ou resposta.
- As regras de segurança são configuradas separadamente por grupo. Na categoria 3, use on ou off. Os comandos também aceitam status. Antilink remove convites de grupos do WhatsApp, antispam remove repetições idênticas, antivizu remove mídias de visualização única, antigaviao avisa quando uma mensagem marca mais de três pessoas, detectargado brinca com frases românticas e zoeira controla a categoria 7. Para excluir mensagens, o bot precisa ser administrador.
- Para iniciar jogos com rodadas, use !quiz iniciar, !forca iniciar ou !adivinhar iniciar. A resposta seguinte explica como jogar. As rodadas ficam na memória até o processo reiniciar.
- !fig e !sticker recebem uma imagem ou vídeo curto. Use o comando na legenda ou responda à mídia. !toimg extrai o primeiro quadro de uma figurinha. !ttp gera figurinha de texto estática e !attp gera texto animado.
- !buscar lista faixas, !musica apresenta a primeira faixa, !play NOME e !p NOME buscam e enviam áudio do catálogo Jamendo com download autorizado. Configure JAMENDO_CLIENT_ID no Render. Use NOME | ARTISTA para refinar. Um link direto MP3 ou M4A de até 12 MB também funciona com MUSIC_AUDIO_ORIGIN e !letra retorna um link de busca da letra.
- Configure OPENAI_API_KEY como segredo no Render para !ia, !perguntar, !resumir e !traduzir. Esses comandos enviam o texto solicitado ou a mensagem citada à OpenAI. OPENAI_MODEL é opcional.
- No grupo, apenas a conta do dono pode usar !grupos, !bloquear, !desbloquear, !reiniciar confirmar e !broadcast confirmar MENSAGEM. O aviso é enviado aos grupos retornados pelo WhatsApp.

## Configurar sem reiniciar

Com o ZUMY conectado, envie **zoom** no grupo. Abra **!configuracao**, **!anticonteudo** ou **!antispamseguranca**. Admins alteram regras com comandos como **!bemvindo 1**, **!antiimg 1** e **!antiimg 0**. O bot grava as regras por grupo imediatamente. Customize a mensagem com **!legendabv Olá, {usuario}!** ou o nome com **!apelido NOME**. Use **!apelido reset** para restaurar. Para ver os atalhos em linguagem natural use **!autonomia**. Para promover alguém use **!promover @pessoa**. O atalho **!p** foi dedicado à música.

O código e os valores configurados em Render → Environment entram em vigor em uma nova instância. Isso pode interromper a conexão durante o deploy. No plano gratuito, o armazenamento da sessão pode ser perdido. Um disco persistente preserva os arquivos salvos nele em próximos deploys, mas requer plano compatível e não recupera uma sessão anterior perdida. Após atualizar, abra /health. Se estiver aguardando_pareamento, use /parear. Não publique credenciais nem os arquivos de SESSION_DIR.

## Alcance dos menus

O menu completo exibe os comandos implementados no pacote. As funções do menu de referência que envolvem detecção visual, download de redes sociais, bloqueio por chamada ou DDD, restauração de mensagens, histórico/atividade, moedas, transcrição, mídia fixada ou cadastro de figurinhas automáticas ainda não fazem parte desta versão. A busca por música por nome abrange o catálogo Jamendo e respeita a permissão de download de cada faixa. Os testes locais simulam o WhatsApp e os serviços externos.
