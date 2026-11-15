import { randomInt } from 'node:crypto';

export const contentRules = {
  antiimg: ['imageMessage'],
  antivideo: ['videoMessage', 'ptvMessage'],
  antiaudio: ['audioMessage'],
  antisticker: ['stickerMessage'],
  antiloc: ['locationMessage', 'liveLocationMessage'],
  anticontato: ['contactMessage', 'contactsArrayMessage'],
  antidoc: ['documentMessage'],
  anticatalogo: ['productMessage', 'orderMessage'],
  antinotas: ['ptvMessage'],
  antipayment: ['requestPaymentMessage', 'sendPaymentMessage', 'paymentInviteMessage', 'declinePaymentRequestMessage'],
  antienquete: ['pollCreationMessage', 'pollCreationMessageV2', 'pollCreationMessageV3'],
};

const featuredRules = [...Object.keys(contentRules), 'antilinkgp', 'antilinkhard', 'antiflod',
  'limitecaracteres', 'bemvindo', 'bemvindo2', 'autosticker', 'modobrincadeira', 'soadm', 'atodos'];

export const extraAdmin = new Set([
  ...featuredRules, 'apelido', 'legendabv', 'legendasaiu', 'legendabv2', 'legendasaiu2',
  'legendasaiureset', 'legendasaiu2reset', 'nomegp', 'totag', 'hidetag', 'adms',
  'del', 'blockcmdgp', 'unblockcmdgp', 'liberar', 'advertencia', 'advertir', 'advertenciaauto',
  'sorteionumero', 'enquete', 'msgtemp', 'revogar', 'cooldown', 'limitecmd', 'tempocmd',
  'antipalavra', 'addpalavra', 'delpalavra', 'listapalavra',
]);

const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[-_]/g, '');
const turn = { on: true, off: false, 1: true, 0: false };
const templates = {
  legendabv: 'welcomeText',
  legendabv2: 'welcomeText2',
  legendasaiu: 'goodbyeText',
  legendasaiu2: 'goodbyeText2',
};
const themes = {
  roça: ['Festa junina', 'Churrasco'],
  amor: ['Encontro no cinema', 'Encontro ao ar livre'],
  humor: ['Memes', 'Figurinhas'],
  brasil: ['Praia', 'Cachoeira'],
  nostalgia: ['Filmes antigos', 'Desenhos antigos'],
  comida: ['Pizza', 'Hambúrguer'],
  viagem: ['Montanha', 'Litoral'],
  comportamento: ['Planejar tudo', 'Improvisar'],
};

function commandName(input) {
  return normalize(input.replace(/^!/, ''));
}

export function createGroupSettings({ config, integrations, known, logger }) {
  const toggle = (name, key = name) => ({ arg, settings, update, reply }) => {
    const input = arg.toLowerCase();
    if (!input || input === 'status') return reply('!' + name + ' ' + (settings[key] ? '1' : '0'));
    if (!Object.hasOwn(turn, input)) return reply('Use !' + name + ' 1 para ativar ou 0 para desativar.');
    update({ [key]: turn[input] });
    return reply('!' + name + ' ' + (turn[input] ? 'ativado.' : 'desativado.'));
  };

  async function warn({ settings, target, update, reply, sock, jid }, reason) {
    if (!target) return reply('Marque ou responda à mensagem de um participante.');
    const now = Date.now();
    const warnings = Object.fromEntries(Object.entries(settings.warnings || {}).filter(([, value]) => value.until > now));
    const current = warnings[target] || { count: 0, until: now + 86400000 };
    current.count++;
    warnings[target] = current;
    update({ warnings });
    if (current.count === 3 && settings.advertenciaauto) {
      const result = await sock.groupParticipantsUpdate(jid, [target], 'remove');
      if (Number(result?.[0]?.status) === 200) return reply('3 avisos em 24 horas. Participante removido.');
      return reply('3 avisos em 24 horas. O WhatsApp não confirmou a remoção.');
    }
    return reply('Aviso ' + current.count + '/3 em 24 horas' + (reason ? ' · ' + reason : '') + '.');
  }

  function setList(field, enabled) {
    return ({ arg, update, settings, reply }) => {
      const cmd = commandName(arg);
      if (!known.has(cmd)) return reply('Informe um comando existente no ZUMY.');
      const list = new Set(settings[field] || []);
      if (enabled) list.add(cmd);
      else list.delete(cmd);
      update({ [field]: [...list] });
      return reply('Configuração atualizada para !' + cmd + '.');
    };
  }

  function cooldown({ arg, settings, update, reply }) {
    if (!arg || arg === 'status') return reply('Intervalo entre comandos: ' + (settings.cooldown || 0) + ' s.');
    const seconds = arg === 'off' ? 0 : Number(arg);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 120) return reply('Informe de 0 a 120 segundos ou off.');
    update({ cooldown: seconds });
    return reply('Intervalo entre comandos: ' + seconds + ' s.');
  }

  function word(enabled) {
    return ({ arg, settings, update, reply }) => {
      const term = arg.trim().toLowerCase();
      if (!term || term.length > 60) return reply('Informe uma palavra ou frase de até 60 caracteres.');
      const terms = new Set(settings.filteredWords || []);
      if (enabled && terms.size >= 100 && !terms.has(term)) return reply('O limite é de 100 termos.');
      if (enabled) terms.add(term);
      else terms.delete(term);
      update({ filteredWords: [...terms] });
      return reply('Lista de palavras atualizada.');
    };
  }

  const commands = {
    cooldown,
    limitecmd: cooldown,
    tempocmd: cooldown,
    antipalavra: toggle('antipalavra'),
    addpalavra: word(true),
    delpalavra: word(false),
    listapalavra: ({ settings, reply }) => reply((settings.filteredWords || []).join('\n') || 'A lista está vazia.'),
    ...Object.fromEntries(featuredRules.map(name => [name, toggle(name)])),
    antilinkgp: toggle('antilinkgp', 'antilink'),
    antiflod: toggle('antiflod', 'antispam'),
    modobrincadeira: toggle('modobrincadeira', 'zoeira'),
    advertenciaauto: toggle('advertenciaauto'),
    limitecaracteres: ({ arg, settings, update, reply }) => {
      if (!arg || arg === 'status') return reply('Limite atual: ' + (settings.maxChars || 'desativado'));
      const value = Number(arg);
      if (!Number.isInteger(value) || (value !== 0 && value !== 1 && (value < 10 || value > 5000))) {
        return reply('Use !limitecaracteres 1 para limitar a 500, 0 para desligar ou defina de 10 a 5000.');
      }
      update({ maxChars: value === 1 ? 500 : value });
      return reply(value ? 'Limite atualizado.' : 'Limite desativado.');
    },
    apelido: ({ arg, settings, update, reply }) => {
      if (!arg) return reply('Apelido neste grupo: ' + (settings.nickname || 'ZUMY'));
      if (arg.length > 32) return reply('Use um apelido de até 32 caracteres.');
      update({ nickname: arg.toLowerCase() === 'reset' ? '' : arg });
      return reply('Apelido atualizado.');
    },
    ...Object.fromEntries(Object.entries(templates).map(([cmd, key]) => [cmd, ({ arg, update, reply }) => {
      if (!arg || arg.length > 500) return reply('Informe uma legenda de até 500 caracteres. Use {usuario} para mencionar.');
      update({ [key]: arg });
      return reply('Legenda salva.');
    }])),
    legendasaiureset: ({ update, reply }) => { update({ goodbyeText: '' }); return reply('Legenda de saída restaurada.'); },
    legendasaiu2reset: ({ update, reply }) => { update({ goodbyeText2: '' }); return reply('Legenda de saída restaurada.'); },
    nomegp: async ({ arg, sock, jid, reply }) => {
      if (!arg || arg.length > 100) return reply('Use !nomegp NOVO NOME com até 100 caracteres.');
      await sock.groupUpdateSubject(jid, arg);
      return reply('Nome atualizado.');
    },
    admins: ({ admins, mention, reply }) => admins.length ? mention('🛡️ Administradores:\n', admins, true) : reply('Nenhum administrador identificado.'),
    adms: ({ admins, mention, reply }) => admins.length ? mention('🚨 Administradores, atenção:\n', admins) : reply('Nenhum administrador identificado.'),
    totag: ({ arg, members, mention }) => mention((arg || 'Atenção, pessoal!') + '\n', members),
    hidetag: ({ arg, members, reply, send }) => arg ? send({ text: arg, mentions: members }) : reply('Use !hidetag SUA MENSAGEM.'),
    del: async ({ sock, jid, quotedKey, reply }) => quotedKey
      ? sock.sendMessage(jid, { delete: quotedKey }) : reply('Responda à mensagem com !del.'),
    blockcmdgp: setList('blockedCommands', true),
    unblockcmdgp: setList('blockedCommands', false),
    liberar: setList('allowedCommands', true),
    revogar: setList('allowedCommands', false),
    listbcmdgp: ({ settings, reply }) => reply((settings.blockedCommands || []).map(cmd => '!' + cmd).join('\n') || 'Sem comandos bloqueados.'),
    liberados: ({ settings, reply }) => reply((settings.allowedCommands || []).map(cmd => '!' + cmd).join('\n') || 'Sem comandos liberados.'),
    advertir: context => warn(context, context.arg),
    advertencia: ({ target, settings, reply }) => {
      if (!target) return reply('Marque alguém para consultar os avisos.');
      const entry = settings.warnings?.[target];
      return reply('Avisos em 24 horas: ' + (entry?.until > Date.now() ? entry.count : 0) + '/3.');
    },
    sorteionumero: ({ arg, reply }) => {
      const max = Number(arg);
      return Number.isInteger(max) && max >= 2 && max <= 1000000
        ? reply('🎲 ' + randomInt(1, max + 1)) : reply('Use !sorteionumero LIMITE, de 2 a 1000000.');
    },
    enquete: ({ arg, reply, send }) => {
      const [name, ...values] = arg.split('|').map(part => part.trim());
      const theme = arg.toLowerCase();
      const choices = values.length ? values : Object.hasOwn(themes, theme) ? themes[theme] : undefined;
      if (!name || !choices || choices.length < 2 || choices.length > 10 || choices.some(value => !value || value.length > 100) ||
        new Set(choices).size !== choices.length || name.length > 200) {
        return reply('Use !enquete Pergunta | Opção 1 | Opção 2 ou !enquete humor.');
      }
      return send({ poll: { name, values: choices, selectableCount: 1 } });
    },
    msgtemp: async ({ arg, sock, jid, reply }) => {
      const periods = { 0: 0, 1: 86400, '24h': 86400, '7d': 604800, '90d': 7776000 };
      if (!Object.hasOwn(periods, arg)) return reply('Use !msgtemp 0, 24h, 7d ou 90d.');
      await sock.sendMessage(jid, { disappearingMessagesInChat: periods[arg] });
      return reply('Mensagens temporárias atualizadas.');
    },
  };

  function mediaReason(settings, content, text) {
    for (const [name, types] of Object.entries(contentRules)) {
      if (settings[name] && types.some(type => content[type])) return name;
    }
    if (settings.antilinkhard && /(?:https?:\/\/|www\.)[^\s]+/i.test(text)) return 'link externo';
    if (settings.antipalavra && (settings.filteredWords || []).some(term => text.toLowerCase().includes(term))) return 'palavra configurada';
    if (settings.maxChars && [...text].length > settings.maxChars) return 'limite de caracteres';
    return '';
  }

  async function greet(sock, { id: jid, action, participants }) {
    if (!jid?.endsWith('@g.us') || !['add', 'remove'].includes(action)) return;
    const settings = config.get(jid);
    if (!settings.bemvindo && !settings.bemvindo2) return;
    for (const participant of participants || []) {
      const id = typeof participant === 'string' ? participant : participant?.id;
      if (!id || id === sock.user?.id || id === sock.user?.lid) continue;
      const second = settings.bemvindo2;
      const label = action === 'add'
        ? (second ? settings.welcomeText2 : settings.welcomeText) || 'Bem-vindo, {usuario}!'
        : (second ? settings.goodbyeText2 : settings.goodbyeText) || '{usuario} saiu do grupo.';
      const tag = '@' + id.split('@')[0].split(':')[0];
      await sock.sendMessage(jid, {
        text: (settings.nickname || 'ZUMY') + ' · ' + label.replaceAll('{usuario}', tag),
        mentions: label.includes('{usuario}') ? [id] : [],
      });
    }
  }

  async function autoSticker(context) {
    if (!context.source.imageMessage) return;
    try {
      await integrations.sticker(context);
    } catch (error) {
      logger.warn({ err: error.message }, 'Falha no autosticker');
    }
  }

  return { commands, mediaReason, greet, autoSticker, warn };
}
