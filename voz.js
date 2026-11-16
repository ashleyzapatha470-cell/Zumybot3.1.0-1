import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const chamouZumy = texto => /(?<![\p{L}\p{N}_])zumy(?![\p{L}\p{N}_])/iu.test(texto);

export function periodoDoDia(data = new Date(), timeZone = 'America/Fortaleza') {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(data));
  if (hora < 5) return 'Boa madrugada!';
  if (hora < 12) return 'Bom dia!';
  if (hora < 18) return 'Boa tarde!';
  return 'Boa noite!';
}

export function criarVoz({ env = process.env, logger = console, gerar = gerarAudio } = {}) {
  const timeZone = env.BOT_TIMEZONE || 'America/Fortaleza';
  const audios = new Map();
  const ultimas = new Map();
  return async ({ jid, send, reply }) => {
    const agora = Date.now();
    if (agora - (ultimas.get(jid) || 0) < 15_000) return;
    if (ultimas.size >= 500) {
      for (const [grupo, desde] of ultimas) if (agora - desde >= 15_000) ultimas.delete(grupo);
      if (ultimas.size >= 500) ultimas.delete(ultimas.keys().next().value);
    }
    ultimas.set(jid, agora);
    const saudacao = periodoDoDia(new Date(agora), timeZone);
    try {
      if (!audios.has(saudacao)) audios.set(saudacao, gerar(saudacao + ' Eu sou a Zumi. Você me chamou? Como posso ajudar?'));
      const audio = await audios.get(saudacao);
      return await send({ audio, mimetype: 'audio/ogg; codecs=opus', ptt: true });
    } catch (error) {
      audios.delete(saudacao);
      logger.warn({ code: error.code, name: error.name }, 'Falha na voz do ZUMY');
      return reply(saudacao + ' Eu sou a Zumy. Você me chamou? Como posso ajudar?');
    }
  };
}

async function gerarAudio(texto) {
  const pasta = await mkdtemp(join(tmpdir(), 'zumy-voz-'));
  try {
    const wav = join(pasta, 'fala.wav');
    const ogg = join(pasta, 'fala.ogg');
    await exec('espeak-ng', ['-v', 'pt-br+f3', '-s', '155', '-w', wav, texto], { timeout: 8000 });
    await exec('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', wav,
      '-c:a', 'libopus', '-ac', '1', '-ar', '48000', '-application', 'voip', ogg], { timeout: 10000 });
    return await readFile(ogg);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}
