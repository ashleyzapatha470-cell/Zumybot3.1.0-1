import express from 'express';
import pino from 'pino';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import { createGroupHandler, identidadePrivada } from './grupos.js';
import { prefix } from './menu.js';
import { chamouZumy } from './voz.js';

const app=express();app.use(express.json());
const port=Number(process.env.PORT||3000);
const folder=process.env.SESSION_DIR||'./session';mkdirSync(folder,{recursive:true});
const authPointer = join(folder, 'zumy-auth-active');
function activeAuthFolder() {
  try {
    const name = readFileSync(authPointer, 'utf8').trim();
    if (!/^whatsapp-[a-zA-Z0-9]{6}$/.test(name)) throw new Error('Pasta de sessão inválida.');
    return join(folder, name);
  } catch (error) {
    if (error.code === 'ENOENT') return folder;
    throw error;
  }
}
function prepareNewAuthFolder() {
  const path = mkdtempSync(join(folder, 'whatsapp-'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  writeFileSync(authPointer + '.tmp', name, { mode: 0o600 });
  renameSync(authPointer + '.tmp', authPointer);
}
const adminToken=process.env.ADMIN_TOKEN;
let status='iniciando',sock=null,qr=null,attempt=0,paused=false;
let reconnectTimer;
const logger=pino({level:process.env.LOG_LEVEL||'info'});
const handleGroup = createGroupHandler({
  folder,
  logger,
  env: process.env,
  downloadMedia: msg => downloadMediaMessage(msg, 'buffer', {}),
  restart: () => process.exit(1),
});
const protect=(req,res,next)=>{if(!adminToken)return res.status(503).json({error:'Configure ADMIN_TOKEN em Environment no Render'});if(req.get('authorization')!==`Bearer ${adminToken}`)return res.status(401).json({error:'Token incorreto. Use o ADMIN_TOKEN do serviço ZUMYBOT-3.0.'});next()};
app.get('/',(_req,res)=>res.type('html').send(`<html lang="pt-br"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZUMY</title><body style="font:18px system-ui;background:#101a28;color:white;padding:24px"><h1>🤖 ZUMY</h1><p>Status público: <b>${status}</b></p><p>Use /health para conferir a conexão. Administração por API protegida.</p></body></html>`));
app.get('/parear', (_req, res) => {
  const nonce = randomBytes(18).toString('base64');
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'nonce-" + nonce +
      "'; style-src 'nonce-" + nonce + "'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
  });
  res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Parear ZUMY</title>
<style nonce="${nonce}">
  * { box-sizing: border-box; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; background: #101a28; color: #fff; }
  main { max-width: 32rem; margin: 4vh auto; }
  label, input, button { display: block; width: 100%; }
  input, button { margin: 6px 0 16px; padding: 12px; border-radius: 8px; font: inherit; }
  input { border: 1px solid #91a8be; }
  button { background: #8af0bb; color: #10241d; border: 0; font-weight: 650; }
  button:disabled { opacity: .65; }
  a { color: #a0deff; }
  #code { font: bold 1.5rem ui-monospace, monospace; letter-spacing: .15em; overflow-wrap: anywhere; }
</style>
<main>
  <h1>Parear ZUMY BOT</h1>
  <form id="pair" autocomplete="off">
    <label for="number">Número do bot com código do país</label>
    <input id="number" type="tel" inputmode="tel" placeholder="55 + DDD + número" required maxlength="25">
    <label for="token">Token de administração do Render (ADMIN_TOKEN)</label>
    <input id="token" type="password" required autocomplete="off">
    <button type="submit">Gerar código</button>
  </form>
  <p id="result" role="status"></p>
  <p id="code"></p>
  <p>No WhatsApp do bot, abra <strong>Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone</strong>.</p>
  <a href="/health">Ver status do bot</a>
</main>
<script nonce="${nonce}">
  const form = document.getElementById('pair');
  const token = document.getElementById('token');
  const number = document.getElementById('number');
  const result = document.getElementById('result');
  const code = document.getElementById('code');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    code.textContent = '';
    result.textContent = 'Solicitando código…';
    const authorization = 'Bearer ' + token.value.trim();
    token.value = '';
    try {
      const response = await fetch('/admin/pair', {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: number.value }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || typeof data.code !== 'string') {
        throw new Error(data.error || 'O servidor não retornou um código.');
      }
      code.textContent = data.code;
      result.textContent = 'Digite este código no WhatsApp do bot.';
    } catch (error) {
      result.textContent = error.message === 'Failed to fetch'
        ? 'Falha ao acessar o serviço. Tente novamente.'
        : error.message;
    } finally {
      submit.disabled = false;
    }
  });
</script>
</html>`);
});
app.get('/health',(_req,res)=>res.json({ok:true,status,funcoes:paused?'pausadas':'ativas',prefixo:prefix,revisao:'comandos-v7'}));
app.get('/admin/status',protect,(_req,res)=>res.json({status,paused,qrDisponivel:!!qr}));
app.post('/admin/pause',protect,(req,res)=>{
  if(typeof req.body?.paused!=='boolean')return res.status(400).json({error:'Informe paused como true ou false'});
  paused=req.body.paused;
  res.json({paused});
});
app.get('/admin/qr',protect,(_req,res)=>res.json({qr:qr||null}));
app.post('/admin/pair',protect,async(req,res)=>{res.set('Cache-Control','no-store');const number=String(req.body?.number||'').replace(/\D/g,'');if(!/^55\d{10,11}$/.test(number))return res.status(400).json({error:'Informe 55 + DDD + número'});if(status==='conectado')return res.status(409).json({error:'O ZUMY já está conectado ao WhatsApp.'});if(!sock||!qr)return res.status(409).json({error:'O ZUMY ainda não está pronto para parear. Confira o status do bot e tente novamente.'});try{const code=await sock.requestPairingCode(number);res.json({code})}catch(e){logger.error({err:e},'Falha pareamento');res.status(500).json({error:'Não foi possível gerar código; confira os logs'})}});
app.listen(port,'0.0.0.0',()=>logger.info({port},'ZUMY HTTP iniciado'));
function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30000, 2000 * 2 ** Math.min(attempt++, 4));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    if (!sock) void startConnection();
  }, delay);
}

async function startConnection() {
  try {
    await connect();
  } catch (error) {
    status = 'aguardando_reconexao';
    logger.error({ err: error }, 'Falha ao iniciar conexão WhatsApp');
    scheduleReconnect();
  }
}

async function connect(){
  status='conectando';const {state,saveCreds}=await useMultiFileAuthState(activeAuthFolder());
  const current=makeWASocket({auth:state,logger:logger.child({module:'baileys'}),printQRInTerminal:false,markOnlineOnConnect:false, syncFullHistory:false});sock=current;
  const processed = new Map();
  let connectedAt = 0;
  current.ev.on('creds.update', () => {
    saveCreds().catch(error => logger.error({ err: error }, 'Falha ao salvar sessão WhatsApp'));
  });
  current.ev.on('connection.update',({connection,lastDisconnect,qr:nextQr})=>{
    if(current!==sock)return;
    if(nextQr){status='aguardando_pareamento';qr=nextQr;logger.info('QR de pareamento disponível')}
    if(connection==='open'){connectedAt=Date.now();status='conectado';qr=null;attempt=0;logger.info('ZUMY WhatsApp conectado')}
    if(connection==='close'){
      sock=null;qr=null;
      const code=lastDisconnect?.error?.output?.statusCode;
      logger.warn({code},'Conexão WhatsApp encerrada');
      if (code === DisconnectReason.loggedOut) {
        status = 'sessao_expirada';
        if (!state.creds?.registered) {
          logger.warn('Sessão sem vínculo recusada pelo WhatsApp. Confira os logs antes de tentar novamente.');
          return;
        }
        try {
          prepareNewAuthFolder();
          status = 'preparando_pareamento';
          attempt = 0;
          logger.info('Sessão encerrada. Preparando novo pareamento.');
          scheduleReconnect();
        } catch (error) {
          logger.error({ code: error.code, name: error.name }, 'Falha ao preparar novo pareamento');
        }
        return;
      }
      if(code===DisconnectReason.connectionReplaced){
        status='conexao_substituida';
        logger.warn('Conexão substituída. Confira se a sessão está aberta em outra instância.');
        return;
      }
      status='aguardando_reconexao';
      scheduleReconnect();
    }
  });
  current.ev.on('group-participants.update', event => {
    if (paused || current !== sock) return;
    handleGroup.onParticipantsUpdate(current, event)
      .catch(error => logger.warn({ err: error }, 'Falha na mensagem de boas-vindas'));
  });
  function commandText(message) {
    while (message?.ephemeralMessage?.message || message?.documentWithCaptionMessage?.message) {
      message = message.ephemeralMessage?.message || message.documentWithCaptionMessage.message;
    }
    return (message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption ||
      message?.videoMessage?.caption || message?.documentMessage?.caption || '').trim();
  }

  current.ev.on('messages.upsert', async ({ messages, type }) => {
    if (paused || current !== sock || !['notify', 'append'].includes(type)) return;
    const now = Date.now();
    for (const [key, receivedAt] of processed) {
      if (now - receivedAt <= 120_000) break;
      processed.delete(key);
    }
    for (const msg of messages || []) {
      if (paused || current !== sock) break;
      const { remoteJid, remoteJidAlt, id, fromMe } = msg?.key || {};
      if (!msg?.message || !remoteJid) continue;
      const text = commandText(msg.message);
      const group = remoteJid.endsWith('@g.us');
      const identityRequest = !group && type === 'notify' && !fromMe &&
        /^\d+(?::\d+)?@(lid|s\.whatsapp\.net|c\.us)$/.test(remoteJid) &&
        text.toLowerCase() === prefix + 'meuid';
      if (!group && !identityRequest) continue;
      const isCommand = text.startsWith(prefix) || /^zoom(?:$|[\s,:])/i.test(text);
      const hasTrigger = isCommand || chamouZumy(text);
      if (type === 'append' || (fromMe && hasTrigger)) {
        const sentAt = Number(msg.messageTimestamp) * 1000;
        if (!fromMe || !hasTrigger || !connectedAt || !Number.isFinite(sentAt) ||
            sentAt < Math.max(connectedAt - 999, now - 30_000) || sentAt > now + 10_000) continue;
      }
      const key = id && remoteJid + ':' + id;
      if (key && processed.has(key)) continue;
      if (key) {
        if (processed.size >= 2048) processed.delete(processed.keys().next().value);
        processed.set(key, now);
      }
      if (isCommand) logger.info({ type, fromMe: Boolean(fromMe) }, 'Comando recebido do WhatsApp');
      try {
        if (identityRequest) {
          await current.sendMessage(remoteJid, { text: identidadePrivada([remoteJid, remoteJidAlt]) });
        } else {
          await handleGroup(current, msg);
        }
      } catch (error) {
        logger.error({ err: error }, 'Erro ao processar mensagem de grupo');
        if (isCommand) {
          await current.sendMessage(remoteJid, { text: 'Não consegui concluir o comando agora.' }, { quoted: msg })
            .catch(err => logger.warn({ err }, 'Falha ao informar erro do comando'));
        }
      }
    }
  });
}
void startConnection();
