import { randomInt } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { botName, categoryCommands, menu, normalizeCommand, ownerName, ownerNumber, prefix, sections } from './menu.js';
import { createGames } from './jogos.js';
import { createIntegrations } from './integracoes.js';
import { createGroupSettings, extraAdmin } from './config-grupo.js';

const pick = values => values[randomInt(values.length)];
const shuffle = values => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const normalizeJid = id => String(id || '').replace(/:\d+(?=@)/, '').replace(/@c\.us$/, '@s.whatsapp.net');
const userJid = number => number + '@s.whatsapp.net';
const groupJid = id => typeof id === 'string' && id.endsWith('@g.us');
const identity = member => [member?.id, member?.phoneNumber, member?.lid].filter(Boolean).map(normalizeJid);
const chatText = message => message?.conversation || message?.extendedTextMessage?.text ||
  message?.imageMessage?.caption || message?.videoMessage?.caption || message?.documentMessage?.caption || '';

function contentOf(message) {
  while (message?.ephemeralMessage?.message || message?.documentWithCaptionMessage?.message) {
    message = message.ephemeralMessage?.message || message.documentWithCaptionMessage.message;
  }
  return message || {};
}

function readSettings(folder) {
  if (!folder) return { get: () => ({}), save: () => {} };
  const path = join(folder, 'zumy-grupos.json');
  let data = {};
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    get: jid => data[jid] || {},
    save(jid, settings) {
      const next = { ...data, [jid]: settings };
      writeFileSync(path + '.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync(path + '.tmp', path);
      data = next;
    },
  };
}

const flags = {
  antilink: 'Links de convite do WhatsApp de participantes comuns são apagados.',
  antispam: 'Apaga repetições idênticas a partir da quarta mensagem em 10 segundos.',
  antivizu: 'Apaga mídias de visualização única de participantes comuns sem abrir o conteúdo.',
  antigaviao: 'Avisa quando um participante menciona mais de três pessoas na mesma mensagem.',
  detectargado: 'Responde a frases românticas com uma brincadeira.',
  zoeira: 'Permite os comandos de zoeira no grupo.',
};

const ownerCommands = new Set(['reiniciar', 'bloquear', 'desbloquear', 'broadcast', 'grupos']);
const adminCommands = new Set([
  'b', 'ban', 'kick', 'd', 'promover', 'rebaixar', 'grupo', 'abrirgp', 'fechargp',
  'marcar', 'linkgp', 'add', 'configurar', ...Object.keys(flags), ...extraAdmin,
]);
const basic = {
  menu: ({ arg, reply }) => reply(menu(arg)),
  ajuda: ({ reply }) => reply('Use !menu para ver os atalhos. Exemplos: !jogos, !musicas e !administracao.\n!menu completo lista tudo.\nResponda a uma mensagem ou marque alguém quando o comando pedir.'),
  dono: ({ reply }) => reply('Dono: ' + ownerName),
  ping: ({ reply }) => reply('🏓 Pong! ZUMY online.'),
  hora: ({ reply }) => reply('🕐 ' + new Intl.DateTimeFormat('pt-BR', {
    timeZone: process.env.BOT_TIMEZONE || 'America/Fortaleza', hour: '2-digit', minute: '2-digit',
  }).format(new Date())),
  status: ({ reply }) => reply('✅ ZUMY conectada e respondendo neste grupo.'),
  infobot: ({ reply }) => reply('🤖 ' + botName + ' · Bot para grupos · Prefixo ' + prefix),
};

const rankings = sections[3].commands;
const relationships = {
  ship: 'Combinação do casal',
  casal: 'Casal sorteado',
  compatibilidade: 'Compatibilidade',
  apaixonado: 'Índice de paixão',
  crush: 'Índice de crush',
  casamento: 'Casamento de brincadeira',
  divorcio: 'Divórcio de brincadeira',
  beijo: 'Beijo virtual',
  namorar: 'Pedido de namoro de brincadeira',
  quemmeama: 'Admirador secreto sorteado',
  quemmetraiu: 'Suspeito fictício sorteado',
};
const jokes = {
  queme: ['Quem é a pessoa mais pontual do grupo?', 'Quem é mais provável de esquecer o próprio aniversário?'],
  eununca: ['Eu nunca ri numa hora errada.', 'Eu nunca mandei mensagem no grupo errado.'],
  confissao: ['Confissão fictícia: sumi do grupo para terminar a série.', 'Confissão fictícia: ensaiei a resposta e esqueci de mandar.'],
  segredo: ['Segredo fictício: a pipoca acabou antes do filme.', 'Segredo fictício: o café é o verdadeiro administrador.'],
  azar: ['Seu azar do dia: o carregador ficou em outro cômodo.', 'Seu azar do dia: o áudio de cinco minutos chegou na hora de dormir.'],
  sorte: ['Sua sorte de hoje: alguém vai te oferecer a última fatia.', 'Sua sorte de hoje: a fila vai andar quando você chegar.'],
  previsao: ['Previsão: vai aparecer uma figurinha para esse momento.', 'Previsão: alguém ainda vai perguntar qual era o assunto.'],
  horoscopo: ['Horóscopo de brincadeira: mercúrio pede menos áudios e mais café.', 'Horóscopo de brincadeira: hoje é dia de responder o grupo.'],
  quemseria: ['Quem seria o primeiro a rir numa reunião séria?', 'Quem seria o guia ideal numa cidade desconhecida?'],
};
const comparisons = { testedeamor: 'Amor', testedebeleza: 'Beleza', testedeloucura: 'Loucura' };

function describeParticipantResult(result, reply) {
  const status = Number(result?.[0]?.status);
  if (status === 200) return reply('Ação concluída.');
  if (status === 403) return reply('O WhatsApp recusou a ação. Para !add, a privacidade da pessoa pode exigir convite.');
  if (status === 409) return reply('O participante já está no grupo.');
  return reply('O WhatsApp não confirmou a ação' + (status ? ' (' + status + ')' : '') + '.');
}

function groupActions() {
  const participantAction = action => async ({ sock, jid, target, reply }) => {
    if (!target) return reply('Marque alguém ou responda à mensagem da pessoa.');
    return describeParticipantResult(await sock.groupParticipantsUpdate(jid, [target], action), reply);
  };
  const setGroup = mode => async ({ sock, jid, arg, reply }) => {
    const input = arg.toLowerCase();
    const selection = mode || ({ abrir: 'a', fechar: 'f' })[input] || input;
    if (!['a', 'f'].includes(selection)) return reply('Use !grupo a ou !grupo f.');
    try {
      await sock.groupSettingUpdate(jid, selection === 'a' ? 'not_announcement' : 'announcement');
    } catch (error) {
      const status = error?.output?.statusCode ?? error?.data?.code;
      if (Number(status) === 403) {
        return reply('O WhatsApp negou a mudança. Confira se o número conectado ao ZUMY está como admin neste grupo.');
      }
      throw error;
    }
    return reply(selection === 'a' ? 'Grupo aberto.' : 'Grupo fechado.');
  };
  return {
    b: participantAction('remove'),
    ban: participantAction('remove'),
    kick: participantAction('remove'),
    promover: participantAction('promote'),
    rebaixar: participantAction('demote'),
    d: async ({ sock, jid, quotedKey, reply }) => {
      if (!quotedKey) return reply('Responda à mensagem que quer apagar com !d.');
      await sock.sendMessage(jid, { delete: quotedKey });
    },
    grupo: setGroup(),
    abrirgp: setGroup('a'),
    fechargp: setGroup('f'),
    marcar: ({ arg, members, mention }) => mention((arg || 'Atenção, pessoal!') + '\n', members),
    linkgp: async ({ sock, jid, reply }) => reply('https://chat.whatsapp.com/' + await sock.groupInviteCode(jid)),
    add: async ({ sock, jid, arg, target, reply }) => {
      const number = arg.replace(/^\+/, '');
      const id = /^\d{10,15}$/.test(number) ? userJid(number) : target;
      if (!id) return reply('Use !add 55DDDNUMERO, marque ou responda à pessoa.');
      return describeParticipantResult(await sock.groupParticipantsUpdate(jid, [id], 'add'), reply);
    },
  };
}

function ownerActions(restart, ownerJid) {
  const block = action => async ({ arg, targetPhone, sock, reply }) => {
    const number = arg.replace(/^\+/, '');
    const target = /^\d{10,15}$/.test(number) ? userJid(number) : targetPhone;
    if (!target || target === ownerJid || target === normalizeJid(sock.user?.id)) {
      return reply('Informe o telefone completo de outra pessoa com código do país.');
    }
    await sock.updateBlockStatus(target, action);
    return reply(action === 'block' ? 'Contato bloqueado.' : 'Contato desbloqueado.');
  };
  return {
    reiniciar: async ({ arg, reply }) => {
      if (arg !== 'confirmar') return reply('Para reiniciar o processo, use !reiniciar confirmar.');
      if (typeof restart !== 'function') return reply('O servidor ainda não forneceu a função de reinício ao bot.');
      await reply('Reiniciando o ZUMY…');
      return restart();
    },
    bloquear: block('block'),
    desbloquear: block('unblock'),
    grupos: async ({ sock, reply }) => {
      const groups = Object.values(await sock.groupFetchAllParticipating());
      if (!groups.length) return reply('O ZUMY não participa de grupos.');
      const list = groups.slice(0, 50).map((group, i) => (i + 1) + '. ' + group.subject);
      return reply('Grupos: ' + groups.length + '\n' + list.join('\n') +
        (groups.length > list.length ? '\nMostrando os primeiros 50.' : ''));
    },
    broadcast: async ({ arg, sock, reply }) => {
      if (!arg.startsWith('confirmar ') || arg.length > 1010) {
        return reply('Use !broadcast confirmar SUA MENSAGEM para enviar um aviso de até 1.000 caracteres a todos os grupos.');
      }
      const groups = Object.keys(await sock.groupFetchAllParticipating()).filter(groupJid);
      let sent = 0;
      for (const jid of groups) {
        try {
          await sock.sendMessage(jid, { text: '📢 Aviso do dono\n' + arg.slice('confirmar '.length) });
          sent++;
        } catch {
          // Continua com os grupos restantes quando uma entrega falha.
        }
      }
      return reply('Aviso enviado a ' + sent + ' de ' + groups.length + ' grupos.');
    },
  };
}

function parseZoom(phrase = '') {
  const text = phrase.trim().replace(/[?!]+$/, '');
  const normalized = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const commands = {
    'abre o grupo': 'abrirgp', 'fecha o grupo': 'fechargp',
    'remova esse': 'ban', 'marca todo mundo': 'marcar',
    'forme um casal': 'casal', 'que horas sao': 'hora',
    'quantos membros tem aqui': 'membros',
  };
  if (Object.hasOwn(commands, normalized)) return commands[normalized];
  if (/^baixe musica\s+/i.test(normalized)) return 'play ' + text.split(/\s+/).slice(2).join(' ');
  if (/^enquete:/i.test(normalized)) {
    const options = text.slice(text.indexOf(':') + 1).trim().split(/\s+ou\s+/i);
    return 'enquete Escolha uma opção | ' + options.join(' | ');
  }
  if (categoryCommands.includes(normalizeCommand(text))) return normalizeCommand(text);
  return 'menu';
}

export function createGroupHandler({ folder, logger = console, downloadMedia, restart, env = process.env } = {}) {
  const ownerDigits = String(env.OWNER_NUMBER || ownerNumber).replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(ownerDigits)) throw new Error('OWNER_NUMBER deve conter DDI, DDD e número.');
  const ownerJid = userJid(ownerDigits);
  const ownerLid = /^\d+@lid$/.test(env.OWNER_LID || '') ? env.OWNER_LID : undefined;
  const config = readSettings(folder);
  const recent = new Map();
  const activeBroadcasts = new Set();
  const lastCommand = new Map();
  const games = createGames();
  const integrations = createIntegrations({ downloadMedia, logger, env });
  const declared = new Set(sections.flatMap(section => section.commands
    .filter(command => !command.startsWith('zoom ')).map(command => command.split(' ')[0])));
  const groupSettings = createGroupSettings({ config, integrations, known: declared, logger });
  let nextSweep = 0;

  const security = Object.fromEntries(Object.entries(flags).map(([name, description]) => [
    name,
    ({ arg, jid, reply, settings }) => {
      const action = arg.toLowerCase();
      if (action === 'status') return reply('!' + name + ': ' + (settings[name] ? 'on' : 'off') + '\n' + description);
      if (!['on', 'off'].includes(action)) return reply('Use ' + prefix + name + ' on, off ou status.\n' + description);
      config.save(jid, { ...settings, [name]: action === 'on' });
      return reply('!' + name + ' ' + action + '\n' + description);
    },
  ]));

  const rank = Object.fromEntries(rankings.map(name => [name, ({ members, mention, reply }) => {
    if (!members.length) return reply('Nenhum participante disponível.');
    return mention('🎲 ' + name + ' · sorteio de brincadeira\n', shuffle(members).slice(0, 5), true);
  }]));
  const relation = Object.fromEntries(Object.entries(relationships).map(([name, label]) => [
    name,
    ({ target, actor, members, mention, reply }) => {
      const candidates = members.filter(id => id !== actor);
      const selected = target || (candidates.length ? pick(candidates) : '');
      if (!selected) return reply('Marque alguém para a brincadeira.');
      const score = ['ship', 'compatibilidade', 'apaixonado', 'crush'].includes(name) ? randomInt(101) + '% · ' : '';
      return mention('❤️ ' + label + ' · ' + score + 'brincadeira\n', [actor, selected].filter(Boolean));
    },
  ]));
  const jokeActions = {
    ...Object.fromEntries(Object.entries(jokes).map(([name, lines]) => [name, ({ reply }) => reply('😂 ' + pick(lines))])),
    ...Object.fromEntries(Object.entries(comparisons).map(([name, label]) => [name,
      ({ reply }) => reply('😂 ' + label + ': ' + randomInt(101) + '% · resultado aleatório.')])),
    duelo: ({ actor, target, members, mention, reply }) => {
      const candidates = members.filter(id => id !== actor);
      const rival = target || (candidates.length ? pick(candidates) : '');
      return actor && rival ? mention('⚔️ Vencedor do duelo: ', [pick([actor, rival])]) : reply('Marque um rival para o duelo.');
    },
    batalha: ({ members, mention, reply }) => members.length > 1
      ? mention('🏆 Finalistas da batalha (em ordem de chegada):\n', shuffle(members).slice(0, 3), true)
      : reply('Preciso de pelo menos dois participantes.'),
  };
  const handlers = {
    ...basic,
    regras: ({ meta, reply }) => reply(meta.desc || 'Este grupo não tem regras na descrição.'),
    ...groupActions(), ...security, ...rank, ...relation, ...games, ...jokeActions, ...integrations,
    ...ownerActions(restart, ownerJid),
    configurar: ({ reply, settings }) => reply(menu('configuracao', { nickname: settings.nickname })),
    ...groupSettings.commands,
    p: integrations.play,
  };
  for (const name of declared) {
    if (!Object.hasOwn(handlers, name)) throw new Error('Comando sem implementação: /' + name);
  }

  async function moderate({ sock, msg, jid, actor, text, content, settings, isAdmin, botAdmin, mentions, reply }) {
    if (isAdmin || msg.key.fromMe) return false;
    let reason = groupSettings.mediaReason(settings, content, text);
    if (settings.antilink && /\bchat\.whatsapp\.com\/[\w-]+/i.test(text)) reason = 'link de convite';
    if (settings.antivizu && (content.viewOnceMessage || content.viewOnceMessageV2 || content.viewOnceMessageV2Extension ||
      content.imageMessage?.viewOnce || content.videoMessage?.viewOnce || content.audioMessage?.viewOnce)) reason = 'mídia de visualização única';
    if (actor && settings.antispam && text && !text.startsWith(prefix)) {
      const now = Date.now();
      if (now >= nextSweep) {
        for (const [key, item] of recent) if (now - item.started >= 10000) recent.delete(key);
        nextSweep = now + 10000;
      }
      const key = jid + ':' + actor;
      const previous = recent.get(key);
      const normalized = text.slice(0, 400).toLowerCase();
      const item = previous?.text === normalized && now - previous.started < 10000
        ? previous : { text: normalized, started: now, count: 0 };
      item.count++;
      recent.set(key, item);
      if (item.count >= 4) reason = 'spam repetido';
    }
    if (reason && botAdmin !== false) {
      try {
        await sock.sendMessage(jid, { delete: msg.key });
      } catch (error) {
        if (Number(error?.output?.statusCode ?? error?.data?.code) === 403) return false;
        throw error;
      }
      if (settings.advertenciaauto && actor) {
        await groupSettings.warn({
          settings: config.get(jid), target: actor, sock, jid,
          update: changes => config.save(jid, { ...config.get(jid), ...changes }),
          reply: text => sock.sendMessage(jid, { text }),
        }, reason);
      } else {
        await sock.sendMessage(jid, { text: '🛡️ Mensagem apagada: ' + reason + '.' });
      }
      return true;
    }
    if (settings.antigaviao && new Set(mentions).size > 3) await reply('🛡️ Evite marcar muita gente sem necessidade.');
    else if (settings.detectargado && /\b(te amo|meu amor|linda demais)\b/i.test(text)) {
      await reply('💘 Radar do romance: alguém está inspirado hoje!');
    }
    return false;
  }

  // Reconhece comandos digitados no telefone vinculado, sem executar respostas do bot.
  const ownCommands = new Set([
    ...ownerCommands, ...Object.keys(rank), ...Object.keys(relation),
    'configurar', 'b', 'ban', 'kick', 'grupo', 'abrirgp', 'fechargp', 'fig', 'sticker', 'toimg',
    'play', 'p', 'ia', 'perguntar', 'resumir', 'traduzir',
  ]);
  const outgoing = new Map();
  const pendingReplies = new Set();

  async function handleGroup(sock, msg) {
    const jid = msg.key?.remoteJid;
    if (!groupJid(jid) || !msg.message) return;
    const content = contentOf(msg.message);
    const text = chatText(content).trim();
    const settings = config.get(jid);
    const zoom = /^zoom(?:[\s,:]+([\s\S]+))?$/i.exec(text);
    const request = zoom ? parseZoom(zoom[1]) : text.startsWith(prefix)
      ? text.slice(prefix.length) : '';
    const match = /^([^\s]+)(?:\s+([\s\S]*))?$/u.exec(request);
    const command = match ? normalizeCommand(match[1]) : '';
    const arg = match?.[2]?.trim() || '';
    if (msg.key.fromMe && (outgoing.has(jid + ':' + msg.key.id) || pendingReplies.has(jid + ':' + text))) return;
    const send = async message => {
      const outgoingText = message.text?.trim();
      const marker = outgoingText && jid + ':' + outgoingText;
      if (marker) pendingReplies.add(marker);
      try {
        const sent = await sock.sendMessage(jid, message, { quoted: msg });
        if (sent?.key?.id) {
          if (outgoing.size >= 512) outgoing.delete(outgoing.keys().next().value);
          outgoing.set(jid + ':' + sent.key.id, true);
        }
        return sent;
      } finally {
        if (marker) pendingReplies.delete(marker);
      }
    };
    const reply = text => send({ text });
    const menuInfo = { nickname: settings.nickname, user: msg.pushName };
    if (msg.key.fromMe && !ownCommands.has(command) && !categoryCommands.includes(command) && !Object.hasOwn(basic, command)) return;
    const hasAccessRules = settings.soadm || settings.blockedCommands?.length || settings.cooldown;
    if (!hasAccessRules) {
      if (command === 'menu') return reply(menu(arg, menuInfo));
      if (categoryCommands.includes(command)) return reply(menu(command, menuInfo));
      if (Object.hasOwn(basic, command)) return basic[command]({ arg, reply });
    }
    const activeSecurity = Object.keys(settings).some(name => name !== 'zoeira' && settings[name] &&
      (Object.hasOwn(flags, name) || name.startsWith('anti') || name === 'maxChars'));
    const automatic = settings.autosticker || (settings.atodos && /^@all(?:\s|$)/i.test(text));
    const knownCommand = declared.has(command) || categoryCommands.includes(command) || command === 'membros' || Object.hasOwn(basic, command);
    if (!activeSecurity && !automatic && !knownCommand) return;
    const ctx = (content.extendedTextMessage || content.imageMessage || content.videoMessage || content.documentMessage)?.contextInfo;
    const mentions = ctx?.mentionedJid || [];
    const botIds = [sock.user?.id, sock.user?.lid, sock.user?.phoneNumber,
      sock.authState?.creds?.me?.id, sock.authState?.creds?.me?.lid].filter(Boolean).map(normalizeJid);
    const ids = msg.key.fromMe ? botIds : [msg.key.participant, msg.key.participantAlt].filter(Boolean).map(normalizeJid);
    const meta = await sock.groupMetadata(jid);
    const participants = meta.participants || [];
    const mapper = sock.signalRepository?.lidMapping;
    async function aliasesFor(identifiers) {
      const aliases = new Set(identifiers);
      if (!mapper) return [...aliases];
      for (const id of identifiers) {
        const resolve = id.endsWith('@lid') ? mapper.getPNForLID : mapper.getLIDForPN;
        if (typeof resolve !== 'function') continue;
        try {
          const alias = normalizeJid(await resolve.call(mapper, id));
          if (alias) aliases.add(alias);
        } catch {
          // Sem vínculo confirmado, a identidade original é a única válida.
        }
      }
      return [...aliases];
    }
    const findMember = identifiers => participants.find(member => identity(member).some(id => identifiers.includes(id)));
    const sender = findMember(ids) || findMember(await aliasesFor(ids));
    const actor = sender?.id || ids[0];
    let senderIds = [...new Set([...ids, ...identity(sender)])];
    if (ownerCommands.has(command) && !senderIds.includes(ownerJid)) senderIds = await aliasesFor(senderIds);
    const isOwner = senderIds.includes(ownerJid) || Boolean(ownerLid && senderIds.includes(ownerLid));
    const isGroupOwner = [meta.owner, meta.ownerPn].some(id => id && senderIds.includes(normalizeJid(id)));
    const isAdmin = isOwner || isGroupOwner || ['admin', 'superadmin'].includes(sender?.admin) ||
      sender?.isAdmin === true || sender?.isSuperAdmin === true;
    const bot = msg.key.fromMe ? sender : findMember(botIds) || findMember(await aliasesFor(botIds));
    const botAdmin = bot ? ['admin', 'superadmin'].includes(bot.admin) ||
      bot.isAdmin === true || bot.isSuperAdmin === true : undefined;
    if (activeSecurity && await moderate({ sock, msg, jid, actor, text, content, settings, isAdmin, botAdmin, mentions, reply })) return;
    const members = participants.filter(member => member !== bot && member.id).map(member => member.id);
    if (!command && settings.atodos && isAdmin && /^@all(?:\s|$)/i.test(text)) {
      return send({ text: text.slice(4).trim() || 'Atenção, pessoal!', mentions: members });
    }
    if (!knownCommand && !settings.autosticker) return;
    if (!isAdmin && knownCommand && (settings.blockedCommands?.includes(command) ||
        (settings.soadm && !settings.allowedCommands?.includes(command)))) {
      return reply('Esse comando está restrito neste grupo.');
    }
    if (knownCommand && !isAdmin && actor && settings.cooldown) {
      const now = Date.now();
      const key = jid + ':' + actor;
      const until = lastCommand.get(key) || 0;
      if (until > now) return reply('Aguarde ' + Math.ceil((until - now) / 1000) + ' s antes de outro comando.');
      if (lastCommand.size >= 1000) {
        for (const [entry, expires] of lastCommand) if (expires <= now) lastCommand.delete(entry);
      }
      lastCommand.set(key, now + settings.cooldown * 1000);
    }
    if (command === 'menu') return reply(menu(arg, menuInfo));
    if (categoryCommands.includes(command)) return reply(menu(command, menuInfo));
    if (Object.hasOwn(basic, command)) return basic[command]({ arg, reply });
    if (command === 'membros') return reply('O grupo tem ' + participants.length + ' participantes.');
    if (command === 'apelido' && !arg) return reply('Apelido neste grupo: ' + (settings.nickname || botName));
    logger.info({ command, jid }, 'Comando de grupo');
    if (ownerCommands.has(command) && !isOwner) return reply('Comando exclusivo do dono do ZUMY.');
    if (adminCommands.has(command) && !isAdmin) return reply('Comando exclusivo dos administradores.');
    if (botAdmin === false && ['b', 'ban', 'kick', 'abrirgp', 'fechargp', 'grupo'].includes(command)) {
      return reply('Torne o número conectado ao ZUMY administrador deste grupo para executar esse comando.');
    }
    if (settings.zoeira === false && Object.hasOwn(jokeActions, command)) return reply('Zoeiras desativadas neste grupo.');
    const target = mentions[0] || ctx?.participant;
    const targetIds = target ? [normalizeJid(target)] : [];
    const targetMember = findMember(targetIds) || (target ? findMember(await aliasesFor(targetIds)) : undefined);
    const targetPhone = [normalizeJid(target), ...identity(targetMember)].find(id => /^\d+@s\.whatsapp\.net$/.test(id));
    const quotedKey = ctx?.stanzaId && ctx.participant ? {
      remoteJid: jid,
      id: ctx.stanzaId,
      participant: ctx.participant,
      fromMe: [...botIds, ...identity(bot)].includes(normalizeJid(ctx.participant)),
    } : null;
    const quoted = quotedKey && ctx.quotedMessage ? { key: quotedKey, message: ctx.quotedMessage } : null;
    const isMedia = message => Boolean(message.imageMessage || message.videoMessage || message.stickerMessage);
    const quotedContent = contentOf(quoted?.message);
    const mediaMessage = isMedia(content) || !isMedia(quotedContent) ? msg : quoted;
    const source = contentOf(mediaMessage.message);
    const context = {
      sock, jid, arg, reply, send, meta, actor, isAdmin, target: targetMember?.id || target, targetPhone, settings, quotedKey, source,
      members,
      admins: participants.filter(member => member.admin === 'admin' || member.admin === 'superadmin' ||
        member.isAdmin === true || member.isSuperAdmin === true).map(member => member.id).filter(Boolean),
      update: changes => config.save(jid, { ...config.get(jid), ...changes }),
      quotedText: chatText(contentOf(quoted?.message)),
      download: download => download(mediaMessage),
      mention: (prefix, ids, numbered = false) => send({
        text: prefix + ids.map((id, i) => (numbered ? (i + 1) + '. ' : '') + '@' + normalizeJid(id).split('@')[0]).join(numbered ? '\n' : ' '),
        mentions: ids,
      }),
    };
    if (!knownCommand) {
      if (settings.autosticker) return groupSettings.autoSticker(context);
      return;
    }
    if (command !== 'broadcast') {
      try {
        return await handlers[command](context);
      } catch (error) {
        const status = error?.output?.statusCode ?? error?.data?.code;
        if (adminCommands.has(command) && Number(status) === 403) {
          return reply('O WhatsApp negou o comando. Confira se o ZUMY está como admin neste grupo.');
        }
        throw error;
      }
    }
    if (activeBroadcasts.has(ownerJid)) return reply('Já há um aviso sendo enviado.');
    activeBroadcasts.add(ownerJid);
    try {
      return await handlers.broadcast(context);
    } finally {
      activeBroadcasts.delete(ownerJid);
    }
  };
  handleGroup.onParticipantsUpdate = groupSettings.greet;
  return handleGroup;
}
