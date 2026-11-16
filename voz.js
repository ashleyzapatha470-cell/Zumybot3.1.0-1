const nomeZumy = /(?<![\p{L}\p{N}_])zumy(?![\p{L}\p{N}_])/giu;
const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export const chamouZumy = texto => new RegExp(nomeZumy.source, 'iu').test(texto);

export const estilosVoz = Object.freeze({
  anime: { voice: 'shimmer', style: 'Voz original com estilo de personagem feminina de anime. Alegre, expressiva e brincalhona, com entonação natural e ritmo leve.' },
  doce: { voice: 'coral', style: 'Fale com voz suave, acolhedora e sorridente, como numa conversa entre amigos.' },
  calma: { voice: 'marin', style: 'Fale em tom calmo e gentil, com ritmo tranquilo e pausas naturais.' },
  grave: { voice: 'cedar', style: 'Use tom mais grave e descontraído, com entonação natural.' },
});

export function periodoDoDia(data = new Date(), timeZone = 'America/Fortaleza') {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(data));
  if (hora < 5) return 'Boa madrugada!';
  if (hora < 12) return 'Bom dia!';
  if (hora < 18) return 'Boa tarde!';
  return 'Boa noite!';
}

function prepararResposta(texto, saudacao) {
  const fala = texto.replace(nomeZumy, ' ').replace(/\s+/g, ' ').trim();
  const limpa = normalize(fala).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(tudo bem|como (voce )?(esta|ta|vai)|como ce ta|como c[eê] esta|voce (esta|ta) bem|e ai tudo certo|ta tudo bem)\b/.test(limpa)) {
    return { resposta: 'Tô bem, sim! Obrigada por perguntar. E você, como tá?' };
  }
  if (/\b(quem (e|eh) voce|qual (e )?seu nome|se apresent[ae])\b/.test(limpa)) {
    return { resposta: 'Eu sou a Zumy, a assistente virtual do grupo. Pode falar comigo pelo meu nome.' };
  }
  if (/^(oi|ola|opa|e ai|ei|bom dia|boa tarde|boa noite|boa madrugada|salve)( (a )?todos)?$/.test(limpa) || !limpa) {
    return { resposta: saudacao + ' Oi, aqui é a Zumy. Tô te ouvindo!' };
  }
  if (/\b(toca|tocar|mande|manda|envie|envia)\b.*\b(musica|audio)\b/.test(limpa)) {
    return { resposta: 'Pra escolher uma música, use exclamação play lista no grupo.' };
  }
  if (/\b(ajuda|me ajuda|comandos|como funciona)\b/.test(limpa) && limpa.split(' ').length <= 5) {
    return { resposta: 'Claro! Você pode me fazer uma pergunta ou digitar exclamação menu para ver o que posso fazer.' };
  }
  if (fala.includes('?') || /^(como|qual|quais|quanto|quando|onde|porque|por que|o que|quem|me explique|me diga)\b/.test(limpa)) {
    return { pergunta: fala.slice(0, 350) };
  }
  return { resposta: 'Tô por aqui! Se quiser conversar, me chama pelo nome e escreve a sua pergunta.' };
}

async function gerarAudio(texto, estilo, chave, consultar) {
  const response = await consultar('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts', voice: estilo.voice, input: texto, response_format: 'opus',
      instructions: 'Fale em português brasileiro. Pronuncie Zumy como Zumi. ' + estilo.style,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Falha no serviço de voz'), { status: response.status, code: erro.error?.code });
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.subarray(0, 4).toString() !== 'OggS' || !audio.subarray(0, 128).includes(Buffer.from('OpusHead'))) {
    throw new Error('O serviço de voz não retornou Ogg Opus.');
  }
  return audio;
}

export function criarVoz({
  env = process.env, logger = console, consultar = fetch,
  gerar = gerarAudio, perguntar,
} = {}) {
  const timeZone = env.BOT_TIMEZONE || 'America/Fortaleza';
  const chave = env.OPENAI_API_KEY?.trim();
  const emAndamento = new Set();
  const audios = new Map();

  return async ({ jid, text, settings, update, send, reply }) => {
    if (emAndamento.has(jid)) return;
    emAndamento.add(jid);
    try {
      const saudacao = periodoDoDia(new Date(), timeZone);
      const pedido = prepararResposta(text, saudacao);
      const texto = pedido.resposta || (chave && perguntar ? await perguntar(pedido.pergunta) : '') ||
        'Vi sua pergunta. A inteligência artificial precisa estar disponível para eu responder sobre esse assunto.';
      const resposta = String(texto).trim().slice(0, 650);
      if (!chave && gerar === gerarAudio) return await reply(resposta);

      const nome = Object.hasOwn(estilosVoz, settings.voiceStyle) ? settings.voiceStyle : 'anime';
      const chaveCache = nome + ':' + resposta;
      try {
        if (!audios.has(chaveCache)) {
          if (audios.size >= 48) audios.delete(audios.keys().next().value);
          audios.set(chaveCache, gerar(resposta, estilosVoz[nome], chave, consultar));
        }
        const audio = await audios.get(chaveCache);
        if (!settings.voiceDisclosed) {
          await send({ text: '🎙️ A voz da Zumy é gerada por inteligência artificial.' }, { citar: false });
          update({ voiceDisclosed: true });
        }
        return await send({ audio, mimetype: 'audio/ogg; codecs=opus', ptt: true });
      } catch (error) {
        audios.delete(chaveCache);
        logger.warn({ status: error.status, code: error.code, name: error.name }, 'Falha na voz do ZUMY');
        return await reply(resposta);
      }
    } finally {
      emAndamento.delete(jid);
    }
  };
}
