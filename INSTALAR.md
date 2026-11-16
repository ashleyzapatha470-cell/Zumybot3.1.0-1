# Atualização dos comandos do Zumybot3.1.0

1. Extraia este ZIP. No GitHub, substitua `grupos.js`, `integracoes.js` e `menu.js` na branch `main`. Preserve o `server.js`, os demais arquivos do projeto e o MP3 original `opera_o_anti_z_gavi_o.mp3` na raiz.
2. No Render, em **Environment**, defina `OWNER_NUMBER` com DDI, DDD e número do dono, só dígitos. Se a versão atual do Baileys só identificar o dono por um LID e não tiver o vínculo com o telefone, também é possível definir `OWNER_LID` com o identificador WhatsApp confirmado do dono no formato `123456789@lid`. Não use o LID de outro participante.
3. Publique o commit no serviço do Render, aguarde o bot conectar e teste os comandos no grupo.
4. Para remover participantes ou abrir e fechar o grupo, a conta conectada ao bot precisa ser administradora. Para reiniciar, use `!reiniciar confirmar` na conta do dono.

## Teste rápido

- `!configurar` abre o menu de configuração para administradores.
- `!ranknoia`, `!rankdoido` e `!ship` devem responder com a brincadeira no grupo.
- `!fig` aceita uma foto com o comando na legenda ou como resposta a uma imagem ou vídeo curto.
- `!play opera` envia o MP3 que já está no repositório.
- `!play verão` envia o link do Audius. Essa faixa ainda precisa de uma fonte autorizada de download para o bot enviar o MP3.
- `!play LINK` envia MP3, M4A ou MP4 de até 12 MB se o link for um arquivo HTTPS direto do endereço configurado em `MUSIC_AUDIO_ORIGIN`. Use um endereço sob controle do administrador, com arquivos que podem ser compartilhados. Use a URL final do arquivo, sem redirecionamento.
- `!ia Diga olá ao grupo` testa a integração. Se falhar, a resposta e os logs distinguem chave recusada, falta de cota, limite e erro de acesso ao modelo.

## Se comandos do próprio número ainda não chegarem

Os testes verificaram os manipuladores com eventos simulados do WhatsApp, a conversão real de uma imagem com FFmpeg e o envio ao manipulador do MP3 local. O `server.js` do repositório não veio nos anexos. Se uma mensagem digitada pelo próprio número conectado continuar sem resposta, confira se o `server.js` encaminha esse evento para `createGroupHandler`. Se o dono for reconhecido mas o reinício continuar indisponível, confira se o `server.js` passa a função `restart` ao manipulador.
