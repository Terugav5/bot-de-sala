require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { execSync, exec } = require('child_process');

// --- CONFIGURAÇÃO ---
const DEVICE_ID = 'emulator-5554';

// Coordenadas dos toques para criar sala e dar GO
const PASSOS_CRIAR_SALA = [
    { x: 1400, y: 600 },
    { x: 900, y: 650 },
    { x: 1350, y: 650 },
];
const PASSO_CAMPO_SENHA = { x: 700, y: 200 };
const PASSO_CONFIRMAR_SENHA = { x: 1500, y: 600 };
const PASSO_CRIAR = { x: 920, y: 650 };
const PASSO_COPIAR_ID = { x: 200, y: 100 };
const PASSOS_FECHAR_MENUS = [
    { x: 650, y: 550 },
    { x: 700, y: 400 },
    { x: 900, y: 450 },
];
const GO_TAP_1 = { x: 1500, y: 700 };
const GO_TAP_2 = { x: 1200, y: 450 };

// --- VARIÁVEIS INTERNAS ---
let INPUT_DEVICE = '/dev/input/event1'; // Padrão, será detectado automaticamente
let useSendevent = false; // Desabilitado até detectar o device

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ====================================================================
// MÉTODO ULTRARRÁPIDO - SENDEVENT (toque direto no kernel do Android)
// ====================================================================

/**
 * Gera os comandos sendevent para simular um toque em (x, y).
 * Protocolo: EV_ABS(3) ABS_MT_TRACKING_ID(57)=0, ABS_MT_POSITION_X(53)=x,
 *            ABS_MT_POSITION_Y(54)=y, EV_SYN(0) SYN_REPORT(0)=0,
 *            depois "dedo soltou" para simular tap completo.
 */
function sendeventTap(x, y) {
    const d = INPUT_DEVICE;
    return [
        // Dedo encostou
        `sendevent ${d} 3 57 0`,    // ABS_MT_TRACKING_ID = 0 (dedo 0)
        `sendevent ${d} 3 53 ${x}`, // ABS_MT_POSITION_X
        `sendevent ${d} 3 54 ${y}`, // ABS_MT_POSITION_Y
        `sendevent ${d} 1 330 1`,   // BTN_TOUCH = 1 (pressionado)
        `sendevent ${d} 0 0 0`,     // SYN_REPORT
        // Dedo soltou
        `sendevent ${d} 3 57 -1`,   // ABS_MT_TRACKING_ID = -1 (soltar)
        `sendevent ${d} 1 330 0`,   // BTN_TOUCH = 0
        `sendevent ${d} 0 0 0`,     // SYN_REPORT
    ].join('; ');
}

/**
 * Gera um comando batch de input tap (fallback se sendevent não funcionar)
 */
function batchTaps(taps) {
    return taps.map(t => `input tap ${t.x} ${t.y}`).join('; ');
}

/**
 * Executa uma sequência de toques da forma mais rápida possível.
 * Todos os toques são enviados num ÚNICO comando shell.
 */
function executarToquesRapidos(taps) {
    if (useSendevent) {
        // MODO SENDEVENT: Instantâneo
        const cmds = taps.map(t => sendeventTap(t.x, t.y)).join('; ');
        execSync(`adb -s ${DEVICE_ID} shell "${cmds}"`, { stdio: 'inherit', timeout: 10000 });
    } else {
        // MODO BATCH: Muito rápido (todos os taps num único shell)
        const cmds = batchTaps(taps);
        execSync(`adb -s ${DEVICE_ID} shell "${cmds}"`, { stdio: 'inherit', timeout: 10000 });
    }
}

/**
 * Executa um único toque rápido
 */
function toqueSingle(tap) {
    if (useSendevent) {
        const cmd = sendeventTap(tap.x, tap.y);
        execSync(`adb -s ${DEVICE_ID} shell "${cmd}"`, { stdio: 'inherit', timeout: 10000 });
    } else {
        execSync(`adb -s ${DEVICE_ID} shell "input tap ${tap.x} ${tap.y}"`, { stdio: 'inherit', timeout: 10000 });
    }
}

/**
 * Digita texto rapidamente (ainda usa input text, mas sem delays desnecessários)
 */
function digitarTexto(texto) {
    execSync(`adb -s ${DEVICE_ID} shell "input text '${texto}'"`, { stdio: 'inherit', timeout: 10000 });
}

// ====================================================================
// DETECÇÃO AUTOMÁTICA DO DEVICE DE INPUT
// ====================================================================

async function detectarInputDevice() {
    try {
        console.log('🔍 Detectando device de input do touchscreen...');
        const output = execSync(`adb -s ${DEVICE_ID} shell "getevent -pl"`, { timeout: 5000 }).toString();

        // Procura pelo device que tem ABS_MT_POSITION_X (é o touchscreen)
        const lines = output.split('\n');
        let currentDevice = '';

        for (const line of lines) {
            if (line.includes('/dev/input/event')) {
                const match = line.match(/(\/dev\/input\/event\d+)/);
                if (match) currentDevice = match[1];
            }
            if (line.includes('ABS_MT_POSITION_X') && currentDevice) {
                INPUT_DEVICE = currentDevice;
                useSendevent = true;
                console.log(`✅ Touchscreen encontrado: ${INPUT_DEVICE}`);
                console.log('⚡ Modo SENDEVENT ativado! Toques serão instantâneos.');
                return;
            }
        }

        console.log('⚠️ Touchscreen não detectado via getevent. Usando modo batch (ainda rápido).');
    } catch (err) {
        console.log('⚠️ Não foi possível detectar device de input:', err.message);
        console.log('🚀 Usando modo batch (input tap em lote - ainda muito mais rápido que antes).');
    }
}

// ====================================================================
// EVENTO: BOT PRONTO
// ====================================================================

client.on('ready', async () => {
    console.log(`✅ Logado como ${client.user.tag}!`);
    console.log('🤖 Bot pronto para automatizar as s    alas do FF.');

    // Tenta detectar o device de input ao iniciar
    await detectarInputDevice();
});

// ====================================================================
// EVENTO: MENSAGEM RECEBIDA
// ====================================================================

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('.cs')) {
        const args = message.content.split(' ');
        const senha = args[1];

        const msg = await message.reply({ content: '⏳ Criando a sala... Aguarde um momento.' });

        try {
            const startTime = Date.now();

            // PASSO 1: Navegar até criar sala (toque por toque com delay)
            toqueSingle(PASSOS_CRIAR_SALA[0]); // tap 1400 600
            await delay(500);
            toqueSingle(PASSOS_CRIAR_SALA[1]); // tap 900 650
            await delay(500);
            toqueSingle(PASSOS_CRIAR_SALA[2]); // tap 1350 650
            await delay(500);

            // PASSO 2: Colocar senha se fornecida
            if (senha) {
                toqueSingle(PASSO_CAMPO_SENHA);
                await delay(500);
                digitarTexto(senha);
                await delay(500);
                toqueSingle(PASSO_CONFIRMAR_SENHA);
                await delay(500);
            }

            // PASSO 3: Criar sala
            toqueSingle(PASSO_CRIAR);
            await delay(3000); // Espera o jogo processar a criação da sala

            // PASSO 4: Copiar ID da sala
            toqueSingle(PASSO_COPIAR_ID);
            await delay(500);

            // PASSO 5: Fechar menus (toque por toque com delay)
            toqueSingle(PASSOS_FECHAR_MENUS[0]);
            await delay(500);
            toqueSingle(PASSOS_FECHAR_MENUS[1]);
            await delay(500);
            toqueSingle(PASSOS_FECHAR_MENUS[2]);
            await delay(500);

            // PASSO 6: Copiar ID novamente para garantir
            toqueSingle(PASSO_COPIAR_ID);
            await delay(500);

            // PASSO 7: Ler ID do clipboard
            let roomId = 'Não copiado';
            try {
                const clipText = execSync('powershell "Get-Clipboard -Raw"').toString().trim();
                console.log(`📋 Texto capturado: "${clipText}"`);
                if (clipText && clipText.length < 50) {
                    roomId = clipText;
                }
            } catch (err) {
                console.error("❌ Erro ao ler clipboard:", err.message);
            }

            const elapsed = Date.now() - startTime;
            console.log(`⏱️ Sala criada em ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s)`);

            const embed = new EmbedBuilder()
                .setTitle(`Sala Criada por ${message.author.username}`)
                .setDescription(`A partida sera iniciada em 3 minutos sozinha ${(elapsed / 1000).toFixed(1)}s*`)
                .setColor('#000000')
                .addFields(
                    { name: 'Sala Id', value: `\`${roomId}\``, inline: true },
                    { name: 'Senha', value: senha ? `\`${senha}\`` : '`Sem Senha`', inline: true }
                )
                .setThumbnail(message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL())
                .setFooter({ text: 'Bot Sala Ford Aposta' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_match')
                    .setLabel('Dar GO Agora')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Primary)
            );

            await msg.edit({ content: '', embeds: [embed], components: [row] });

            const TEMPO_ESPERA = 3 * 60 * 1000;
            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.customId === 'start_match',
                time: TEMPO_ESPERA
            });

            let partidaIniciada = false;

            const darGo = async () => {
                if (partidaIniciada) return;
                partidaIniciada = true;

                try {
                    // GO ULTRA-RÁPIDO: dois toques em batch
                    executarToquesRapidos([GO_TAP_1, GO_TAP_2]);
                    console.log("🚀 Partida Iniciada! (Modo Ultra-Rápido)");

                    embed.setColor('#e74c3c').setDescription('🔥 A partida foi iniciada!');
                    await msg.edit({ embeds: [embed], components: [] });
                } catch (e) {
                    console.error("Erro no comando GO:", e);
                }
            };

            collector.on('collect', async (interaction) => {
                if (!interaction.member.permissions.has('ManageMessages')) {
                    return interaction.reply({ content: '❌ Só mediadores podem dar GO.', ephemeral: true });
                }
                await interaction.reply({ content: '▶️ Iniciando a partida...', ephemeral: true });
                darGo();
                collector.stop();
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && !partidaIniciada) darGo();
            });

        } catch (error) {
            console.error('Erro na automação:', error);
            await msg.edit({ content: '❌ Erro ao criar a sala. Verifique a conexão ADB e o emulador.' });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
