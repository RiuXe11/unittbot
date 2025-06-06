const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

const CONFIG_FILE = path.join(__dirname, '..', '..', '..', 'data', 'ticket', 'ticketConfig.json');

let ticketConfig = {
    channelName: '',
    logChannel: '',
    ticketName: 'Ticket',
    description: 'Ceci est un ticket',
    category: '',
    embedColor: '#00ff00',
    buttonName: 'Créer un ticket',
    buttonColor: ButtonStyle.Primary 
};

// Configuration functions
function saveConfig() {
    const dirPath = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(ticketConfig, null, 2));
}

function loadConfig() {
    const defaultConfig = {
        channelName: '',
        logChannel: '',
        ticketName: 'Ticket',
        description: 'Ceci est un ticket',
        category: ''
    };

    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const loadedConfig = JSON.parse(data);
            ticketConfig = { ...defaultConfig, ...loadedConfig };
            console.log("Configuration chargée avec succès.");
        } else {
            console.log("Fichier de configuration non trouvé. Utilisation des valeurs par défaut.");
            ticketConfig = { ...defaultConfig };
            saveConfig();
        }
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
        ticketConfig = { ...defaultConfig };
    }

    Object.keys(defaultConfig).forEach(key => {
        if (ticketConfig[key] === undefined) {
            ticketConfig[key] = defaultConfig[key];
        }
    });
}

// Load config at startup
loadConfig();

// Utility function for safe replies
async function safeReply(interaction, content, options = {}) {
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content, ephemeral: true, ...options });
        } else {
            await interaction.reply({ content, ephemeral: true, ...options });
        }
    } catch (error) {
        console.error('Erreur lors de la réponse à l\'interaction:', error);
    }
}

// Embed creation functions
function createConfigEmbed(guild = null) {
    const embed = new EmbedBuilder()
        .setTitle('Configuration du système de ticket')
        .setDescription('Utilisez les boutons ci-dessous pour configurer le système de ticket.')
        .setColor(guild ? colorManager.getColor(guild.id) : '#0099ff');


    const fields = [
        { name: 'Salon du menu', value: ticketConfig.channelName ? `<#${ticketConfig.channelName}>` : 'Non défini', inline: true },
        { name: 'Salon de logs', value: ticketConfig.logChannel ? `<#${ticketConfig.logChannel}>` : 'Non défini', inline: true },
        { name: 'Nom du ticket', value: ticketConfig.ticketName || 'Non défini', inline: true },
        { name: 'Description', value: ticketConfig.description || 'Non définie', inline: true },
        { name: 'Catégorie du ticket', value: ticketConfig.category ? `<#${ticketConfig.category}>` : 'Non définie', inline: true },
        { name: 'Couleur de l\'embed', value: ticketConfig.embedColor || '#00ff00', inline: true },
        { name: 'Nom du bouton', value: ticketConfig.buttonName || 'Créer un ticket', inline: true },
        { name: 'Couleur du bouton', value: getButtonColorName(ticketConfig.buttonColor) || 'Bleu', inline: true }
    ];
   
    // Ajout de tous les champs
    fields.forEach(field => {
        embed.addFields(field);
    });

    return embed;
}

// Fonction auxiliaire pour obtenir le nom de la couleur du bouton
function getButtonColorName(buttonStyle) {
    const colorMap = {
        [ButtonStyle.Primary]: 'Bleu',
        [ButtonStyle.Secondary]: 'Gris',
        [ButtonStyle.Success]: 'Vert',
        [ButtonStyle.Danger]: 'Rouge'
    };
    return colorMap[buttonStyle] || 'Bleu';
}

function createButtonRows() {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('channelName')
                .setLabel('Définir le nom du salon')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('logChannel')
                .setLabel('Définir le salon des logs')
                .setStyle(ButtonStyle.Primary),
        );
    
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticketName')
                .setLabel('Définir le nom du ticket')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('description')
                .setLabel('Définir la description')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('category')
                .setLabel('Définir la catégorie')
                .setStyle(ButtonStyle.Secondary)
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('embedColor')
                .setLabel('Couleur embed')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('buttonName')
                .setLabel('Nom du bouton')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('buttonColor')
                .setLabel('Couleur bouton')
                .setStyle(ButtonStyle.Secondary)
        );

    const row4 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('send')
                .setLabel('Envoyer')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('cancel')
                .setLabel('Annuler')
                .setStyle(ButtonStyle.Danger)
        );

    return [row1, row2, row3, row4];
}

// Main ticket management functions
async function sendTicketLog(interaction, closedBy) {
    if (!ticketConfig.logChannel) {
        console.error('Canal de logs non configuré');
        return;
    }

    const logChannel = interaction.guild.channels.cache.get(ticketConfig.logChannel);
    if (!logChannel) {
        console.error('Canal de logs non trouvé');
        return;
    }

    const ticketChannel = interaction.channel;
    const ticketCreator = ticketChannel.topic ? ticketChannel.topic.split(': ')[1] : 'Inconnu';

    // Récupérer tous les messages du canal
    const messages = await ticketChannel.messages.fetch();
    
    // Créer un Set des IDs uniques des utilisateurs qui ont envoyé des messages
    const activeParticipants = new Set();
    messages.forEach(message => {
        if (!message.author.bot) { // Optionnel: exclure les bots
            activeParticipants.add(message.author.id);
        }
    });

    const transcript = await discordTranscripts.createTranscript(ticketChannel, {
        limit: -1,
        fileName: `transcript-${ticketChannel.name}.html`,
        poweredBy: false
    });

    const logEmbed = new EmbedBuilder()
        .setTitle(`📁 Ticket fermé - Logs (#${ticketChannel.name.split('-')[1]})`)
        .setColor('#ff0000')
        .addFields(
            { name: '🔓 Ouvert par', value: `<@${ticketCreator}>`, inline: true },
            { name: '🔒 Fermé par', value: `<@${closedBy.id}>`, inline: true },
            { name: '🏷️ Nom du ticket', value: ticketChannel.name, inline: true },
            { name: '🆔 Identifiant', value: `#${ticketChannel.name.split('-')[1]}`, inline: true },
            { name: '📅 Date de fermeture', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
            { name: '👥 Participants', value: Array.from(activeParticipants).map(id => `<@${id}>`).join('\n') || 'Aucun' }
        )
        .setTimestamp();

    await logChannel.send({
        embeds: [logEmbed],
        files: [transcript]
    });
}

function getQuestion(customId) {
    const questions = {
        channelName: '> **Mentionnez** le salon du menu ou entrez son \`ID\` :',
        logChannel: '> **Mentionnez** le salon des logs ou entrez son \`ID\` :',
        ticketName: '> **Entrez** le nouveau nom du ticket :',
        description: '> **Entrez** la nouvelle description :',
        category: '> **Mentionnez** la catégorie pour les tickets ou entrez son \`ID\` :',
        embedColor: '> **Entrez** un code couleur hexadécimal (ex: \`#ff0000\` pour rouge) :',
        buttonName: '> **Entrez** le nouveau nom du bouton :',
        buttonColor: '> **Choisissez** la couleur du bouton (\`BLEU\`, \`GRIS\`, \`VERT\`, \`ROUGE\`) :'
    };
    return questions[customId] || 'Entrez la nouvelle valeur :';
}

function addTicketButtons(embed) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('Claim')
                .setStyle(ButtonStyle.Primary)
        );

    return { embeds: [embed], components: [row] };
}

// Configuration handlers
async function handleConfigInteraction(interaction) {
    const customId = interaction.customId;
    const question = getQuestion(customId);

    await safeReply(interaction, question);

    const filter = m => m.author.id === interaction.user.id;
    try {
        const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
        const response = collected.first().content;

        if (customId === 'channelName' || customId === 'logChannel' || customId === 'category') {
            const channelId = response.replace(/[<#>]/g, '');
            const channel = interaction.guild.channels.cache.get(channelId);
            if (channel) {
                updateConfig(customId, channelId);
                await safeReply(interaction, `> ✅ - ${getConfigName(customId)} a été mis à jour : ${channel}`);
            } else {
                await safeReply(interaction, 'Canal invalide. Veuillez spécifier un canal valide.');
                return;
            }
        } else if (customId === 'embedColor') {
            // Validation du code couleur hexadécimal
            const colorRegex = /^#[0-9A-Fa-f]{6}$/;
            if (!colorRegex.test(response)) {
                await safeReply(interaction, 'Code couleur invalide. Utilisez le format hexadécimal (ex: #ff0000)');
                return;
            }
            updateConfig('embedColor', response);
            await safeReply(interaction, `> ✅ - La couleur de l'embed a été mise à jour.`);
        } else if (customId === 'buttonColor') {
            const colorMap = {
                'BLEU': ButtonStyle.Primary,
                'GRIS': ButtonStyle.Secondary,
                'VERT': ButtonStyle.Success,
                'ROUGE': ButtonStyle.Danger
            };
            
            const color = response.toUpperCase();
            if (!colorMap[color]) {
                await safeReply(interaction, 'Couleur invalide. Utilisez BLEU, GRIS, VERT ou ROUGE.');
                return;
            }
            
            updateConfig('buttonColor', colorMap[color]);
            await safeReply(interaction, `> ✅ - La couleur du bouton a été mise à jour.`);
        } else if (customId === 'buttonName') {
            if (response.length > 80) {
                await safeReply(interaction, 'Le nom du bouton est trop long (maximum 80 caractères).');
                return;
            }
            updateConfig('buttonName', response);
            await safeReply(interaction, `> ✅ - Le nom du bouton a été mis à jour.`);
        } else {
            updateConfig(customId, response);
            await safeReply(interaction, 'Configuration mise à jour.');
        }
        
        await updateEmbed(interaction.message);
    } catch (error) {
        console.error('Erreur lors de la configuration:', error);
        await safeReply(interaction, 'Temps écoulé ou une erreur est survenue. Veuillez réessayer.');
    }
}

function getConfigName(customId) {
    const configNames = {
        channelName: 'Le salon du menu',
        logChannel: 'Le salon de logs',
        category: 'La catégorie du ticket'
    };
    return configNames[customId] || customId;
}

function updateConfig(key, value) {
    ticketConfig[key] = value;
    saveConfig();
}

async function updateEmbed(message) {
    const updatedEmbed = createConfigEmbed(message.guild);
    await message.edit({ embeds: [updatedEmbed] });
}

// Ticket management handlers
async function handleCloseTicket(interaction) {
    const confirmEmbed = new EmbedBuilder()
        .setTitle('Confirmation de fermeture')
        .setDescription('Voulez-vous vraiment fermer ce ticket ?')
        .setColor('#ff0000');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_close')
                .setLabel('Fermer')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('cancel_close')
                .setLabel('Annuler')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: false });
}

async function handleConfirmClose(interaction) {
    await interaction.update({ content: '> ⛔ - Le ticket sera fermé dans \`5 secondes\`.', components: [], embeds: [] });
    await sendTicketLog(interaction, interaction.user);
    
    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch (error) {
            console.error('Erreur lors de la suppression du canal:', error);
            await interaction.followUp('Une erreur est survenue lors de la fermeture du ticket.');
        }
    }, 5000);
}

async function handleClaimTicket(interaction) {
    const member = interaction.member;
    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await safeReply(interaction, "Vous n'avez pas la permission de claim ce ticket.");
        return;
    }

    const channel = interaction.channel;
    const ticketCreator = channel.topic ? channel.topic.split(': ')[1] : null;

    if (!ticketCreator) {
        await safeReply(interaction, "Impossible de trouver le créateur du ticket.");
        return;
    }

    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
    await channel.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true });
    await channel.permissionOverwrites.edit(ticketCreator, { ViewChannel: true, SendMessages: true });

    await interaction.reply({ content: `Le ticket a été claim par ${member}. Seuls le créateur du ticket et ${member} peuvent désormais y accéder.` });
}

async function handleCancelClose(interaction) {
    await interaction.update({ content: 'Fermeture du ticket annulée.', components: [], embeds: [] });
}

async function sendTicket(interaction) {
    const guild = interaction.guild;
    const channel = guild.channels.cache.get(ticketConfig.channelName);
    
    if (!channel) {
        await safeReply(interaction, `Le salon <#${ticketConfig.channelName}> n'existe pas ou n'est pas accessible. Veuillez utiliser le bouton "Nom du salon" pour spécifier un salon existant valide.`);
        return;
    }

    const ticketEmbed = new EmbedBuilder()
        .setTitle(ticketConfig.ticketName)
        .setDescription(ticketConfig.description)
        .setColor(ticketConfig.embedColor || '#00ff00');

    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create')
                .setLabel(ticketConfig.buttonName || 'Créer un ticket')
                .setStyle(ticketConfig.buttonColor || ButtonStyle.Primary)
        );

    try {
        await channel.send({ embeds: [ticketEmbed], components: [buttonRow] });
        await safeReply(interaction, `Le ticket a été envoyé avec succès dans le salon ${channel}.`);
    } catch (error) {
        console.error('Erreur lors de l\'envoi du ticket:', error);
        await safeReply(interaction, 'Une erreur est survenue lors de l\'envoi du ticket. Vérifiez les permissions du bot dans le salon spécifié.');
    }
}

async function createTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const category = guild.channels.cache.get(ticketConfig.category);

    if (!category) {
        await interaction.editReply({ content: `La catégorie spécifiée n'existe pas. Veuillez vérifier la configuration.`, ephemeral: true });
        return;
    }

    try {
        console.log('Début de la création du ticket');

        const channel = await guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: `Ticket créé par: ${interaction.user.id}`,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                },
            ],
        });

        console.log('Canal du ticket créé');

        const userInfoMessage = `<@${interaction.user.id}> a ouvert un ticket.\n\n` +
                              `• ID utilisateur : \`${interaction.user.id}\`\n` +
                              `• Tag : \`${interaction.user.tag}\``;

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🔓 - Ticket Ouvert (#${channel.name.split('-')[1]})`)
            .setDescription(`Merci d'avoir ouvert ce ticket ! L'équipe de modération va prendre en charge le ticket.`)
            .addFields(
                { name: 'Date d\'ouverture', value: `\`${new Date().toLocaleString()}\`` }
            )
            .setColor('#00ff00');
                    
        const messageWithButtons = addTicketButtons(ticketEmbed);

        console.log('Envoi des messages dans le canal du ticket');
        await channel.send(userInfoMessage);
        await channel.send(messageWithButtons);

        console.log('Messages envoyés, réponse à l\'interaction');
        await interaction.editReply({ content: `Votre ticket a été créé: ${channel}`, ephemeral: true });

        console.log('Création du ticket terminée avec succès');

    } catch (error) {
        console.error('Erreur détaillée lors de la création du ticket:', error);
        await interaction.editReply({ 
            content: 'Une erreur est survenue lors de la création du ticket. L\'équipe technique a été notifiée.', 
            ephemeral: true 
        });
    }
}

async function cancelTicketConfig(interaction) {
    try {
        await interaction.message.delete();
        await interaction.followUp({ content: '> ✅ - La configuration du ticket a été annulée.', ephemeral: true });
    } catch (error) {
        console.error('Erreur lors de l\'annulation de la configuration:', error);
        await interaction.followUp({ content: 'Une erreur est survenue lors de l\'annulation de la configuration.', ephemeral: true });
    }
}

// Main module exports
module.exports = {
    name: 'ticket',
    description: 'Configurer le système de ticket',
    
    async execute(message, client) {
        try {
            const embed = createConfigEmbed(message.guild); // Passons le guild
            const rows = createButtonRows();
    
            await message.channel.send({ embeds: [embed], components: rows });
        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande ticket:', error);
            await message.reply('Une erreur est survenue lors de l\'exécution de cette commande.');
        }
    },

    async handleInteraction(interaction) {
        if (!interaction.isButton()) return;
    
        try {
            switch (interaction.customId) {
                case 'send':
                    await sendTicket(interaction);
                    break;
                case 'create':
                    await createTicket(interaction);
                    break;
                case 'close_ticket':
                    await handleCloseTicket(interaction);
                    break;
                case 'confirm_close':
                    await handleConfirmClose(interaction);
                    break;
                case 'cancel_close':
                    await handleCancelClose(interaction);
                    break;
                case 'claim_ticket':
                    await handleClaimTicket(interaction);
                    break;
                case 'cancel':
                    await cancelTicketConfig(interaction);
                    break;
                case 'channelName':
                case 'logChannel':
                case 'ticketName':
                case 'description':
                case 'category':
                    await handleConfigInteraction(interaction);
                    break;
                default:
                    return;
            }
        } catch (error) {
            console.error('Erreur lors de la gestion de l\'interaction dans ticket.js:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Une erreur est survenue lors du traitement de votre demande.', ephemeral: true }).catch(console.error);
            } else {
                await interaction.followUp({ content: 'Une erreur est survenue lors du traitement de votre demande.', ephemeral: true }).catch(console.error);
            }
        }
    },

    createTicket,
    addTicketButtons,
    sendTicketLog
};