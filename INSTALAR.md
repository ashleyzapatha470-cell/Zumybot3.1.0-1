# Zumybot · Painel v9

## Atualizar no GitHub

Envie os arquivos extraídos deste pacote para a raiz da branch `main` do repositório Zumybot3.1.0. O `package.json` inclui a biblioteca de QR Code. Mantenha os arquivos MP3 e M4A que já estão no repositório.

Abra o serviço do bot no Render e publique o último commit. Em `/health`, a revisão deve aparecer como `painel-v9`.

## Persistir o cadastro e o WhatsApp

Mantenha `ADMIN_TOKEN` configurado como segredo no Render. Use seu valor somente na página `/parear`.

Confirme em **Disks** que o serviço tem um disco persistente e que `SESSION_DIR` aponta para uma pasta dentro do ponto de montagem. Exemplo: disco montado em `/var/data` e variável `SESSION_DIR=/var/data/zumy-session`. Se já usa uma pasta persistente, mantenha o endereço atual para reaproveitar a sessão. Se a pasta anterior era temporária, a primeira instalação no novo disco pode exigir pareamento. A pasta guarda as credenciais da conexão, o cadastro do dono e as configurações de cada grupo em arquivos separados.

## Usar o painel

1. Em `/parear`, informe o `ADMIN_TOKEN`. Na seção **Dono do bot**, toque em **Carregar cadastro**, informe o nome e telefone da conta responsável e salve. Se o WhatsApp apresentar essa conta apenas por LID, mande `!meuid` com ela e salve o LID que o bot enviar em privado. O número do dono pode ser diferente do número usado para parear.
2. Teste `!dono` para confirmar o nome e `!reiniciar` pela conta do dono para verificar a permissão. Pare na solicitação de confirmação para evitar reiniciar.
3. Se o WhatsApp estiver desconectado, use **Mostrar QR Code** ou **Gerar código** com o número da conta do bot. Use **Preparar nova sessão** quando a sessão estiver encerrada e o painel indicar essa opção.
4. Com o WhatsApp conectado, toque em **Sincronizar grupos**. Selecione o grupo e ajuste o apelido, o modo de boas-vindas e as legendas. As alterações são aplicadas no grupo selecionado assim que forem salvas.
5. O menu de música inclui `!play lista`, `!play artista NOME` e `!play archive MÚSICA | ARTISTA`.

Salvar o cadastro do dono não reinicia o processo nem altera o pareamento. Se o WhatsApp desvincular a sessão, será preciso vincular de novo.
