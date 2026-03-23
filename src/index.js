require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { execSync } = require('child_process');

// --- CONFIGURAÇÃO ---
const DEVICE_ID = 'emulator-5554'; // ID do seu LDPlayer atual
const TEMPO_ENTRE_PASSOS = 800; // Tempo em milissegundos (0.8 segundos) para ser mais rápido
// As coordenadas para dar o "GO" (precisamos delas para iniciar a partida)
const COORDENADAS_GO = '1500 700'; // Coordenada do botão de Iniciar no seu emulador

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função centralizada para comandos ADB
const adb = (cmd) => execSync(`adb -s ${DEVICE_ID} ${cmd}`);

client.on('ready', () => {
    console.log(`✅ Logado como ${client.user.tag}!`);
    console.log('🤖 Bot pronto para automatizar as salas do FF.');
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith('.cs')) {
        const args = message.content.split(' ');
        const senha = args[1]; // Pode ser undefined se não for fornecida

        const msg = await message.reply({ content: '⏳ Criando a sala... Aguarde um momento.' });

        try {
            // Sequência de criar sala (ajustando os toques para o seu dispositivo)
            adb('shell input tap 1400 600'); await delay(TEMPO_ENTRE_PASSOS);
            adb('shell input tap 900 650'); await delay(TEMPO_ENTRE_PASSOS);
            adb('shell input tap 1350 650'); await delay(TEMPO_ENTRE_PASSOS);
            
            // SÓ COLOCA SENHA SE FOI FORNECIDA
            if (senha) {
                adb('shell input tap 700 200'); await delay(TEMPO_ENTRE_PASSOS);
                adb(`shell input text "${senha}"`); await delay(TEMPO_ENTRE_PASSOS);
                // Confirmar senha (ajustado para suas coordenadas novas 1500 600)
                adb('shell input tap 1500 600'); await delay(TEMPO_ENTRE_PASSOS);
            }

            // Criar Sala
            adb('shell input tap 920 650'); await delay(3000); // 3s para sala carregar

            // Copiar ID da Sala (supondo que o toque 250 100 copia o ID no FF)
            adb('shell input tap 200 100'); await delay(TEMPO_ENTRE_PASSOS);

            // Fechar menus/popups extras se houver (passos 8, 9, 10 do seu original)
            adb('shell input tap 650 550'); await delay(TEMPO_ENTRE_PASSOS);
            adb('shell input tap 700 400'); await delay(TEMPO_ENTRE_PASSOS);
            adb('shell input tap 900 450'); await delay(TEMPO_ENTRE_PASSOS);

            // 7. Copiar ID da Sala (Agora via Clipboard do Windows, o LDPlayer sincroniza sozinho)
            adb('shell input tap 200 100');
            await delay(1500);

            // Pegar o ID da área de transferência do Windows (o LDPlayer manda o 'Copiar' do Android para cá)
            let roomId = 'Não copiado';
            try {
                // Forçamos o powershell a pegar o texto que o emulador acabou de copiar
                const clipboardObj = execSync('powershell "Get-Clipboard -Raw"');
                const clipText = clipboardObj.toString().trim();

                console.log(`📋 Texto capturado do LDPlayer: "${clipText}"`);

                // Valida se o texto parece um ID de sala (curto e sem espaços)
                if (clipText && clipText.length < 50) {
                    roomId = clipText;
                }
            } catch (err) {
                console.error("❌ Não foi possível ler o clipboard do Windows:", err.message);
            }

            const embed = new EmbedBuilder()
                .setTitle('🎮 Sala Criada com Sucesso!')
                .setDescription('A partida será iniciada em 3 minutos ou por um mediador abaixo.')
                .setColor('#2ecc71')
                .addFields(
                    { name: '🆔 ID da Sala', value: `\`${roomId}\``, inline: true },
                    { name: '🔑 Senha', value: senha ? `\`${senha}\`` : '`Sem Senha`', inline: true }
                )
                .setThumbnail(message.guild.iconURL({ dynamic: true }) || client.user.displayAvatarURL())
                .setFooter({ text: 'BOT FF - Automático' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start_match')
                    .setLabel('Dar GO Agora')
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Danger)
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
                    // Clica no botão de INICIAR (GO) no jogo
                    adb(`shell input tap ${COORDENADAS_GO}`);
                    console.log("🚀 Partida Iniciada via Comando GO!");

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
            await msg.edit({ content: '❌ Erro ao criar a sala. Verifique a conexão ADB.' });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
