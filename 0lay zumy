
const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const { spawn } = require('child_process')

const MAX_DURACAO = 12 * 60
const MAX_TAMANHO = 8 * 1024 * 1024
const MAX_TAMANHO_CAPA = 5 * 1024 * 1024
const QUALIDADE = '128K'
const TIMEOUT = 180000

const pesquisasAtivas = new Set()

function executarYtDlp(argumentos, timeout = TIMEOUT) {
    return new Promise((resolve, reject) => {
        const processo = spawn('yt-dlp', argumentos, {
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''
        let finalizado = false

        const temporizador = setTimeout(() => {
            processo.kill('SIGKILL')
            terminar(new Error('A operação demorou demasiado. Tenta novamente.'))
        }, timeout)

        function terminar(erro, resultado) {
            if (finalizado) return
            finalizado = true
            clearTimeout(temporizador)

            if (erro) reject(erro)
            else resolve(resultado)
        }

        processo.stdout.on('data', dados => {
            stdout += dados.toString()
        })

        processo.stderr.on('data', dados => {
            stderr += dados.toString()

            if (stderr.length > 12000) {
                stderr = stderr.slice(-12000)
            }
        })

        processo.on('error', erro => {
            terminar(new Error(
                erro.code === 'ENOENT'
                    ? 'yt-dlp não foi encontrado no sistema.'
                    : erro.message
            ))
        })

        processo.on('close', codigo => {
            if (codigo === 0) {
                terminar(null, stdout.trim())
            } else {
                const linhas = stderr.trim().split('\n')
                terminar(new Error(
                    linhas[linhas.length - 1] ||
                    'Não foi possível processar a música.'
                ))
            }
        })
    })
}

function formatarDuracao(segundos) {
    if (segundos === undefined || segundos === null) {
        return 'Não disponível'
    }

    const minutos = Math.floor(segundos / 60)
    const restantes = Math.floor(segundos % 60)

    return `${minutos}:${String(restantes).padStart(2, '0')}`
}

function formatarVisualizacoes(numero) {
    if (numero === undefined || numero === null) {
        return 'Não disponível'
    }

    return Number(numero).toLocaleString('pt-PT')
}

function formatarData(data) {
    if (!data || !/^\d{8}$/.test(String(data))) {
        return 'Não disponível'
    }

    const ano = data.slice(0, 4)
    const mes = data.slice(4, 6)
    const dia = data.slice(6, 8)

    return `${dia}/${mes}/${ano}`
}

function limitarTexto(texto, limite = 350) {
    if (!texto) return 'Não disponível'

    const limpo = String(texto)
        .replace(/\s+/g, ' ')
        .trim()

    if (!limpo) return 'Não disponível'

    return limpo.length > limite
        ? limpo.slice(0, limite).trim() + '...'
        : limpo
}

async function pesquisarMusica(texto) {
    const resultado = await executarYtDlp([
        '--no-warnings',
        '--skip-download',
        '--dump-single-json',
        '--socket-timeout', '15',
        '--retries', '2',
        '--',
        `ytsearch1:${texto}`
    ])

    if (!resultado) {
        throw new Error('Não encontrei resultados para essa pesquisa.')
    }

    let dados

    try {
        dados = JSON.parse(resultado)
    } catch (_) {
        throw new Error('O YouTube devolveu uma resposta inválida.')
    }

    // A pesquisa pode devolver uma playlist com os vídeos dentro de entries.
    const video = dados.entries?.find(item => item && item.id) || dados

    if (!video || !video.id) {
        throw new Error('Não foi possível identificar o vídeo encontrado.')
    }

    const url = video.webpage_url ||
        (video.id ? `https://www.youtube.com/watch?v=${video.id}` : null)

    if (!url) {
        throw new Error('Não foi possível obter o link da música.')
    }

    if (video.duration && video.duration > MAX_DURACAO) {
        throw new Error('Esta música ultrapassa o limite de 12 minutos.')
    }

    return {
        id: video.id,
        url,
        titulo: video.title || 'Título desconhecido',
        artista: video.artist ||
            video.creator ||
            video.uploader ||
            video.channel ||
            'Artista desconhecido',
        duracao: formatarDuracao(video.duration),
        visualizacoes: formatarVisualizacoes(video.view_count),
        publicado: formatarData(video.upload_date || video.release_date),
        descricao: limitarTexto(video.description),
        thumbnail: video.thumbnail ||
            `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`
    }
}

// Descarrega a capa para evitar depender do carregamento direto pelo WhatsApp.
function descarregarCapa(url, destino, redirecionamentos = 0) {
    return new Promise((resolve, reject) => {
        if (redirecionamentos > 5) {
            return reject(new Error('Demasiados redirecionamentos da capa.'))
        }

        let endereco

        try {
            endereco = new URL(url)
        } catch (_) {
            return reject(new Error('Endereço da capa inválido.'))
        }

        if (endereco.protocol !== 'https:') {
            return reject(new Error('Endereço da capa não seguro.'))
        }

        const pedido = https.get(endereco, resposta => {
            const codigo = resposta.statusCode || 0

            if ([301, 302, 303, 307, 308].includes(codigo)) {
                const novoEndereco = resposta.headers.location
                resposta.resume()

                if (!novoEndereco) {
                    return reject(new Error('Redirecionamento sem endereço.'))
                }

                const absoluto = new URL(novoEndereco, endereco).toString()

                return resolve(
                    descarregarCapa(
                        absoluto,
                        destino,
                        redirecionamentos + 1
                    )
                )
            }

            if (codigo !== 200) {
                resposta.resume()
                return reject(new Error('Não foi possível obter a capa.'))
            }

            const partes = []
            let tamanho = 0

            resposta.on('data', parte => {
                tamanho += parte.length

                if (tamanho > MAX_TAMANHO_CAPA) {
                    pedido.destroy()
                    return reject(new Error('A capa ultrapassou o limite.'))
                }

                partes.push(parte)
            })

            resposta.on('end', () => {
                try {
                    const imagem = Buffer.concat(partes)
                    fs.writeFileSync(destino, imagem)
                    resolve(destino)
                } catch (erro) {
                    reject(erro)
                }
            })

            resposta.on('error', reject)
        })

        pedido.setTimeout(15000, () => {
            pedido.destroy(new Error('O download da capa demorou demasiado.'))
        })

        pedido.on('error', reject)
    })
}

async function baixarMusica(url, pasta) {
    await executarYtDlp([
        '--no-warnings',
        '--no-playlist',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', QUALIDADE,
        '--format', 'bestaudio/best',
        '--no-embed-thumbnail',
        '--no-embed-metadata',
        '--socket-timeout', '20',
        '--retries', '2',
        '--fragment-retries', '2',
        '--concurrent-fragments', '4',
        '--output', path.join(pasta, 'musica.%(ext)s'),
        '--',
        url
    ])

    const ficheiros = fs.readdirSync(pasta)
        .filter(nome => nome.toLowerCase().endsWith('.mp3'))

    if (!ficheiros.length) {
        throw new Error('Não foi possível criar o áudio MP3.')
    }

    const caminho = path.join(pasta, ficheiros[0])
    const tamanho = fs.statSync(caminho).size

    if (tamanho > MAX_TAMANHO) {
        throw new Error(
            'O áudio ultrapassou o limite de 8 MB. Tenta uma música mais curta.'
        )
    }

    return caminho
}

function criarMensagemMusica(musica) {
    return (
        `╭𓆩˚༺⛩️༻˚₊𓆩🪷𓆪₊˚༺⛩️༻˚𓆪╮\n` +
        ` 🎶 𝐌𝐔́𝐒𝐈𝐂𝐀 𝐄𝐍𝐂𝐎𝐍𝐓𝐑𝐀𝐃𝐀! 🎶\n\n` +
        `  📍*Título*: ${musica.titulo}\n` +
        `  👤*Artista*: ${musica.artista}\n` +
        `  ⏱️*Duração*: ${musica.duracao}\n` +
        `  💡*Visualizações*: ${musica.visualizacoes}\n` +
        ` 📆 *Publicado*: ${musica.publicado}\n` +
        ` 📃 *Descrição*: ${musica.descricao}\n\n` +
        ` 🔗 *Link*: ${musica.url}\n\n` +
        `╰𓆩˚༺⛩️༻˚₊𓆩🪷𓆪₊˚༺⛩️༻˚𓆪╯`
    )
}

module.exports = {
    name: 'play',
    description: 'Pesquisa e reproduz músicas pelo YouTube',
    category: 'downloads',
    aliases: ['p', 'musica', 'música'],

    async execute({
        trueBankai,
        from,
        info,
        q,
        args,
        reply,
        reagir
    }) {
        const pesquisa = (q || args?.join(' ') || '').trim()

        if (!pesquisa) {
            return reply(
                'Pesquisa uma música pelo nome, artista, letra ou descrição.\n\n' +
                'Exemplo: ¥play The Climb Miley Cyrus'
            )
        }

        if (pesquisasAtivas.has(from)) {
            return reply(
                'Já existe uma pesquisa ou download em andamento neste chat.'
            )
        }

        pesquisasAtivas.add(from)

        let pastaTemporaria

        try {
            await reagir('🔎')
            await reply('*A pesquisar a tua música...*')

            const musica = await pesquisarMusica(pesquisa)

            pastaTemporaria = fs.mkdtempSync(
                path.join(os.tmpdir(), 'truebankai-play-')
            )

            const mensagem = criarMensagemMusica(musica)
            const caminhoCapa = path.join(pastaTemporaria, 'capa.jpg')

            await reagir('⏳')

            // A capa é opcional: se falhar, a pesquisa e o áudio continuam.
            let capaEnviada = false

            try {
                await descarregarCapa(musica.thumbnail, caminhoCapa)

                const imagem = fs.readFileSync(caminhoCapa)

                await trueBankai.sendMessage(
                    from,
                    {
                        image: imagem,
                        caption: mensagem
                    },
                    { quoted: info }
                )

                capaEnviada = true
            } catch (erroCapa) {
                console.error('[PLAY] Não foi possível enviar a capa:', erroCapa.message)
            }

            if (!capaEnviada) {
                await reply(mensagem)
            }

            const caminhoAudio = await baixarMusica(
                musica.url,
                pastaTemporaria
            )

            const audio = fs.readFileSync(caminhoAudio)

            await trueBankai.sendMessage(
                from,
                {
                    audio,
                    mimetype: 'audio/mpeg',
                    fileName: 'true-bankai-musica.mp3',
                    ptt: false
                },
                { quoted: info }
            )

            await reagir('✅')

        } catch (erro) {
            console.error('[PLAY]', erro)

            try {
                await reagir('❌')
            } catch (_) {}

            return reply(
                `Não consegui enviar a música.\n\n` +
                `${erro.message || 'Erro desconhecido.'}`
            )

        } finally {
            pesquisasAtivas.delete(from)

            if (pastaTemporaria && fs.existsSync(pastaTemporaria)) {
                try {
                    fs.rmSync(pastaTemporaria, {
                        recursive: true,
                        force: true
                    })
                } catch (erro) {
                    console.error('[PLAY] Erro ao limpar temporários:', erro)
                }
            }
        }
    }
}
