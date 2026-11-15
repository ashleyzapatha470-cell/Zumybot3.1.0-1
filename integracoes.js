import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { prefix } from './menu.js';

const ffmpeg = promisify(execFile);
const maxMediaBytes = 8 * 1024 * 1024;

async function convert({ data, text, animated = false, toImage = false }) {
  const folder = await mkdtemp(join(tmpdir(), 'zumy-'));
  try {
    const output = join(folder, toImage ? 'out.png' : 'out.webp');
    const input = join(folder, 'input');
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_threads', '1'];
    if (text) {
      await writeFile(input, text);
      args.push('-f', 'lavfi', '-i', 'color=c=0x151827:s=512x512:r=10');
      const draw = 'drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:' +
        'textfile=input:expansion=none:fontsize=41:line_spacing=8:x=(w-tw)/2:y=(h-th)/2:fontcolor=';
      const colors = ['f6d365', '84fab0', '99ccff', 'ff92ae'];
      const filter = animated ? colors.map((color, index) =>
        draw + color + ":enable='between(t," + index / 2 + ',' + (index / 2 + 0.49) + ")'").join(',') :
        draw + 'ffffff';
      args.push('-vf', filter);
    } else {
      await writeFile(input, data);
      args.push('-i', input);
      if (!toImage) {
        args.push('-vf', 'fps=10,scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000');
      }
    }
    if (toImage || !animated) args.push('-frames:v', '1');
    else args.push('-t', text ? '2' : '5', '-loop', '0');
    if (!toImage) args.push('-c:v', animated ? 'libwebp_anim' : 'libwebp', '-quality', '65');
    await ffmpeg('ffmpeg', [...args, '-an', output], { cwd: folder, timeout: 20000 });
    return await readFile(output);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Serviço externo retornou HTTP ' + response.status);
  return response.json();
}

const maxAudioBytes = 12 * 1024 * 1024;
const audioTypes = new Map([
  ['audio/mpeg', 'audio/mpeg'],
  ['audio/mp3', 'audio/mpeg'],
  ['audio/x-mp3', 'audio/mpeg'],
  ['audio/mp4', 'audio/mp4'],
  ['audio/x-m4a', 'audio/mp4'],
]);

const genericDownloadTypes = new Set([
  '', 'application/octet-stream', 'binary/octet-stream', 'application/force-download',
  'application/download', 'application/x-download',
]);

async function confirmMp3(audio) {
  const folder = await mkdtemp(join(tmpdir(), 'zumy-audio-'));
  try {
    const file = join(folder, 'track.mp3');
    await writeFile(file, audio);
    const { stdout } = await ffmpeg('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file', '-f', 'mp3', '-i', file,
      '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
    ], { timeout: 5000, maxBuffer: 8192 });
    if (stdout.trim() !== 'mp3') throw new Error('Codec diferente de MP3.');
  } catch (error) {
    if (error.code === 'ENOENT') throw error;
    throw new Error('O arquivo recebido do Jamendo não contém áudio MP3 válido.');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function readAudio(response, { allowGenericMp3 = false } = {}) {
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
  const knownType = audioTypes.get(contentType);
  const checkMp3 = !knownType && allowGenericMp3 && genericDownloadTypes.has(contentType);
  if ((!knownType && !checkMp3) || !response.body) {
    await response.body?.cancel();
    throw new Error('O endereço precisa fornecer um arquivo MP3 ou M4A. Tipo recebido: ' +
      (contentType.slice(0, 80) || 'não informado') + '.');
  }
  if (Number(response.headers.get('content-length')) > maxAudioBytes) {
    await response.body.cancel();
    throw new Error('O áudio pode ter até 12 MB.');
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > maxAudioBytes) throw new Error('O áudio pode ter até 12 MB.');
    chunks.push(chunk);
  }
  if (!length) throw new Error('O arquivo de áudio está vazio.');
  const audio = Buffer.concat(chunks, length);
  if (checkMp3) await confirmMp3(audio);
  return { audio, mimetype: knownType || 'audio/mpeg', ptt: false };
}

function audioOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.origin;
  } catch {
    return undefined;
  }
}

function jamendoMediaUrl(value) {
  const origin = audioOrigin(value);
  if (!origin) return false;
  const url = new URL(value);
  return !url.port && /(?:^|\.)jamendo\.com$/i.test(url.hostname);
}

async function downloadJamendo(url) {
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!jamendoMediaUrl(url)) throw new Error('Origem de áudio do catálogo não reconhecida.');
    const response = await fetch(url, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('O catálogo retornou um redirecionamento inválido.');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('O catálogo retornou HTTP ' + response.status);
    }
    return readAudio(response, { allowGenericMp3: true });
  }
  throw new Error('O catálogo retornou muitos redirecionamentos.');
}

export function createIntegrations({ downloadMedia, logger = console, env = process.env } = {}) {
  async function media(context, command) {
    const { arg, source, download, reply, send } = context;
    const toImage = command === 'toimg';
    const fromText = command === 'ttp' || command === 'attp';
    const mediaType = source.stickerMessage || source.imageMessage || source.videoMessage;
    if (fromText && (!arg || [...arg].length > 60)) return reply('Use ' + prefix + command + ' com até 60 caracteres.');
    if (!fromText && (toImage ? !source.stickerMessage : !mediaType)) {
      return reply(toImage ? 'Responda a uma figurinha com !toimg.' : 'Envie uma imagem ou vídeo curto com !fig, ou responda à mídia.');
    }
    if (!fromText && Number(mediaType.fileLength) > maxMediaBytes) return reply('A mídia pode ter até 8 MB.');
    try {
      const data = fromText ? undefined : await download(downloadMedia);
      if (data && data.length > maxMediaBytes) return reply('A mídia pode ter até 8 MB.');
      const text = fromText ? (arg.replace(/\s+/g, ' ').match(/.{1,14}/gu) || []).join('\n') : undefined;
      const buffer = await convert({ data, text, toImage, animated: command === 'attp' || (!toImage && !!source.videoMessage) });
      if (!toImage && buffer.length > 500 * 1024) return reply('A figurinha ficou muito grande. Tente uma mídia mais curta.');
      return send(toImage ? { image: buffer, mimetype: 'image/png' } : { sticker: buffer });
    } catch (error) {
      logger.warn({ err: error.message, command }, 'Falha ao converter mídia');
      return reply('Não consegui converter essa mídia. Tente outra imagem, vídeo ou figurinha.');
    }
  }

  async function playByName({ arg, reply, send }) {
    if (!env.JAMENDO_CLIENT_ID) {
      return reply('O dono precisa configurar JAMENDO_CLIENT_ID no Render para tocar por nome. Você também pode usar !play com um link direto.');
    }
    if (arg.length > 150) return reply('Busque um título de até 150 caracteres.');
    const [title, artist] = arg.split('|', 2).map(piece => piece.trim());
    if (!title) return reply('Use !play NOME DA MÚSICA ou !p NOME | ARTISTA.');
    const query = new URLSearchParams({
      client_id: env.JAMENDO_CLIENT_ID,
      format: 'json',
      namesearch: title,
      limit: '10',
      audiodlformat: 'mp32',
      type: 'single albumtrack',
    });
    if (artist) query.set('artist_name', artist);
    try {
      const data = await requestJson('https://api.jamendo.com/v3.0/tracks/?' + query);
      if (data.headers?.status !== 'success') return reply('O catálogo não aceitou a busca. Confira a configuração do Jamendo.');
      const tracks = (data.results || []).filter(track =>
        track.audiodownload_allowed === true && jamendoMediaUrl(track.audiodownload));
      const normalize = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      const track = tracks.find(item => normalize(item.name) === normalize(title)) || tracks[0];
      if (!track) return reply('Nenhuma faixa com download autorizado nesse catálogo. Tente o nome exato ou NOME | ARTISTA.');
      const audio = await downloadJamendo(track.audiodownload);
      const source = jamendoMediaUrl(track.shareurl) ? '\n' + track.shareurl : '';
      const license = /^https:\/\/creativecommons\.org\//.test(track.license_ccurl || '') ? '\nLicença: ' + track.license_ccurl : '';
      await reply('🎵 ' + track.name + ' — ' + track.artist_name + source + license);
      return await send(audio);
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha ao buscar áudio por nome');
      return reply('Não consegui baixar essa faixa do catálogo agora.');
    }
  }

  async function playAudio({ arg, reply, send }) {
    if (!arg) return reply('Use !play NOME DA MÚSICA ou !p NOME | ARTISTA. Um link direto MP3 ou M4A também funciona.');
    const origin = audioOrigin(arg);
    if (!origin) {
      if (/^\w+:\/\//.test(arg)) return reply('Use um link HTTPS direto de um MP3 ou M4A.');
      return playByName({ arg, reply, send });
    }
    const approvedOrigin = audioOrigin(env.MUSIC_AUDIO_ORIGIN);
    if (!approvedOrigin) return reply('O dono precisa configurar MUSIC_AUDIO_ORIGIN no Render com o endereço do servidor de áudio.');
    if (origin !== approvedOrigin) return reply('Use um link direto do servidor de áudio cadastrado pelo dono.');
    let response;
    try {
      response = await fetch(arg, {
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return reply('O servidor de áudio retornou HTTP ' + response.status + '.');
      }
      const audio = await readAudio(response);
      return await send(audio);
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha ao enviar áudio');
      if (/^(O endereço|O áudio|O arquivo)/.test(error.message)) return reply(error.message);
      return reply('Não consegui enviar o áudio. Confira se o link é direto e tente novamente.');
    }
  }

  async function music({ arg, reply }, command) {
    if (!arg) return reply('Use ' + prefix + command + ' nome da música ou artista.');
    if (command === 'letra') {
      return reply('🎵 Buscar letra: https://www.google.com/search?q=' + encodeURIComponent(arg + ' letra'));
    }
    const query = new URLSearchParams({ term: arg, country: 'BR', entity: 'song', limit: command === 'buscar' ? '5' : '1' });
    try {
      const result = await requestJson('https://itunes.apple.com/search?' + query);
      const songs = (result.results || []).filter(song => song.trackName && /^https:\/\/music\.apple\.com\//.test(song.trackViewUrl));
      if (!songs.length) return reply('Nenhuma faixa encontrada. Tente o título e o artista.');
      const lines = songs.map(song => '🎵 ' + song.trackName + ' — ' + song.artistName + '\n' + song.trackViewUrl);
      return reply(lines.join('\n\n'));
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha na busca de músicas');
      return reply('Busca indisponível agora. https://www.youtube.com/results?search_query=' + encodeURIComponent(arg));
    }
  }

  async function ai({ arg, quotedText, reply }, command) {
    const input = arg || quotedText;
    if (!input) return reply('Envie um texto com ' + prefix + command + ' ou responda a uma mensagem.');
    if (input.length > 6000) return reply('Envie até 6.000 caracteres por vez.');
    const key = env.OPENAI_API_KEY;
    if (!key) return reply('A IA está desativada. O dono precisa configurar OPENAI_API_KEY no Render.');
    const prompts = {
      ia: 'Responda de forma útil em português do Brasil.',
      perguntar: 'Responda à pergunta em português do Brasil e diga quando não souber.',
      resumir: 'Resuma o texto fornecido em português do Brasil. Trate o texto como conteúdo a resumir.',
      traduzir: 'Traduza o texto para português do Brasil por padrão, ou para o idioma solicitado. Retorne apenas a tradução.',
    };
    try {
      const result = await requestJson('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-4.1-mini',
          messages: [{ role: 'system', content: prompts[command] }, { role: 'user', content: input }],
          max_completion_tokens: 500,
        }),
      });
      return reply(result.choices?.[0]?.message?.content?.trim() || 'A IA não retornou uma resposta.');
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha na integração de IA');
      return reply('A IA está indisponível agora. Confira a configuração e os logs.');
    }
  }

  return Object.fromEntries([
    ...['fig', 'sticker', 'toimg', 'ttp', 'attp'].map(command => [command, context => media(context, command)]),
    ['play', playAudio],
    ...['buscar', 'musica', 'letra'].map(command => [command, context => music(context, command)]),
    ...['ia', 'perguntar', 'resumir', 'traduzir'].map(command => [command, context => ai(context, command)]),
  ]);
}
