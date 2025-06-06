const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

const statusConfigPath = path.join(process.cwd(), 'data', 'status-config.json');

let isMultipleMode = false;
let messageCount = 1;
let statusInterval = null;
let rotationDelay = 5000;

const timeButton = new ButtonBuilder()
    .setCustomId('status_time')
    .setLabel(`Délai: ${rotationDelay/1000}s`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⏱️')
    .setDisabled(!isMultipleMode);

function saveStatus(type, text, isMultiple = false, multipleMessages = null) {
    try {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        const config = {
            type,
            text: isMultiple ? JSON.stringify(multipleMessages) : text,
            isMultiple,
            multipleMessages: isMultiple ? multipleMessages : null,
            messageCount: isMultiple ? multipleMessages.length : 1,
            rotationDelay // Ajout du délai dans la sauvegarde
        };

        fs.writeFileSync(statusConfigPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du statut:', error);
        throw error;
    }
}

function startMultipleStatus(client, type, messages) {
    if (statusInterval) {
        clearInterval(statusInterval);
    }

    let currentIndex = 0;
    client.user.setPresence({
        activities: [{
            name: messages[currentIndex],
            type: type
        }],
        status: 'online'
    });

    statusInterval = setInterval(() => {
        currentIndex = (currentIndex + 1) % messages.length;
        client.user.setPresence({
            activities: [{
                name: messages[currentIndex],
                type: type
            }],
            status: 'online'
        });
    }, rotationDelay);
}

module.exports = {
    name: 'status',
    description: 'Modifier le statut du bot via un menu interactif',
    
    async initStatus(client) {
        try {
            if (fs.existsSync(statusConfigPath)) {
                const savedStatus = JSON.parse(fs.readFileSync(statusConfigPath, 'utf8'));
                rotationDelay = savedStatus.rotationDelay || 5000;
                
                // Vérifier si le texte est un tableau JSON stringifié
                let messages = [];
                try {
                    messages = JSON.parse(savedStatus.text);
                } catch {
                    messages = [savedStatus.text];
                }
    
                // Si nous avons plusieurs messages, activer le mode multiple
                if (Array.isArray(messages) && messages.length > 1) {
                    isMultipleMode = true;
                    messageCount = messages.length;
                    startMultipleStatus(client, savedStatus.type, messages);
                } else {
                    isMultipleMode = false;
                    messageCount = 1;
                    await client.user.setPresence({
                        activities: [{
                            name: Array.isArray(messages) ? messages[0] : savedStatus.text,
                            type: savedStatus.type
                        }],
                        status: 'online'
                    });
                }
            }
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du statut:', error);
            // Définir un statut par défaut en cas d'erreur
            await client.user.setPresence({
                activities: [{
                    name: "Je suis prêt !",
                    type: ActivityType.Custom
                }],
                status: 'online'
            });
        }
    },

    async execute(message, args, client) {
        try {
            // Vérifications initiales...
            console.log('État du client:', {
                clientExists: !!client,
                userExists: !!client?.user,
                wsStatus: client?.ws?.status,
                readyAt: !!client?.readyAt
            });

            if (!client?.readyAt) {
                return message.reply('❌ Le bot est en cours d\'initialisation. Veuillez patienter quelques instants.');
            }

            if (!client || !client.user || client.ws.status !== 0) {
                return message.reply('❌ Le bot n\'est pas correctement initialisé. Veuillez réessayer dans quelques instants.');
            }

            if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return message.reply('❌ Vous devez être administrateur pour utiliser cette commande.');
            }

            if (!client?.user) {
                console.error('Erreur critique: Client prêt mais user non défini');
                return message.reply('❌ Une erreur est survenue avec l\'authentification du bot. Veuillez contacter l\'administrateur.');
            }

            const serverColor = colorManager.getColor(message.guild.id);
            
            // Récupération du statut actuel
            let currentType = 'Aucun';
            let currentName = 'Aucun';
            
            try {
                const activity = client.user.presence?.activities?.[0];
                if (activity) {
                    currentType = getActivityTypeName(activity.type);
                    currentName = activity.name;
                }
            } catch (error) {
                console.error('Erreur lors de la récupération du statut actuel:', error);
            }
    
            const embed = new EmbedBuilder()
                .setColor(serverColor)
                .setTitle('📊 Modification du statut du bot')
                .setDescription('Sélectionnez le type de statut que vous souhaitez définir.')
                .addFields(
                    { name: 'Statut actuel', value: `Type: ${currentType}\nTexte: ${currentName}` },
                    { name: 'Mode', value: isMultipleMode ? `Multiple (${messageCount} messages)` : 'Simple' }
                )
                .setFooter({ text: 'Cliquez sur un bouton pour modifier le statut' });
    
            // Création des boutons de statut
            const modeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('status_mode')
                        .setLabel(isMultipleMode ? 'Mode Multiple' : 'Mode Simple')
                        .setStyle(isMultipleMode ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setEmoji(isMultipleMode ? '🔄' : '1️⃣'),
                    timeButton
                );

            // Création du bouton de mode
            const statusButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('status_playing')
                        .setLabel('Joue à')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎮'),
                    new ButtonBuilder()
                        .setCustomId('status_watching')
                        .setLabel('Regarde')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👀'),
                    new ButtonBuilder()
                        .setCustomId('status_listening')
                        .setLabel('Écoute')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎧'),
                    new ButtonBuilder()
                        .setCustomId('status_competing')
                        .setLabel('Participe à')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏆'),
                    new ButtonBuilder()
                        .setCustomId('status_custom')
                        .setLabel('Personnalisé')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✏️')
                );

            const msg = await message.reply({ 
                embeds: [embed], 
                components: [modeButton, statusButtons]
            });

            const collector = msg.createMessageComponentCollector({ 
                filter: i => i.user.id === message.author.id,
                time: 60000 
            });
    
            collector.on('collect', async interaction => {
                try {
                    if (interaction.customId === 'status_time') {
                        if (!isMultipleMode) {
                            await interaction.reply({
                                content: '❌ Le délai ne peut être modifié qu\'en mode multiple.',
                                ephemeral: true
                            });
                            return;
                        }
                    
                        await interaction.reply({
                            content: 'Veuillez entrer le délai en secondes (format: "Xs", minimum 1s) :',
                            ephemeral: true
                        });
                    
                        const timeCollected = await message.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                    
                        const timeMsg = timeCollected.first();
                        await timeMsg.delete().catch(() => {});
                    
                        const timeMatch = timeMsg.content.match(/^(\d+)s$/);
                        if (!timeMatch) {
                            await interaction.followUp({
                                content: '❌ Format invalide. Utilisez le format "Xs" (exemple: "5s").',
                                ephemeral: true
                            });
                            return;
                        }
                    
                        const seconds = parseInt(timeMatch[1]);
                        if (seconds < 2) {
                            await interaction.followUp({
                                content: '❌ Le délai minimum est de 2 secondes.',
                                ephemeral: true
                            });
                            return;
                        }
                    
                        rotationDelay = seconds * 1000;
                    
                        // Mettre à jour le bouton
                        modeButton.components[1].setLabel(`Délai: ${seconds}s`);
                    
                        // Si un intervalle est en cours, le mettre à jour
                        if (statusInterval) {
                            const currentMessages = JSON.parse(fs.readFileSync(statusConfigPath, 'utf8')).multipleMessages;
                            const currentType = JSON.parse(fs.readFileSync(statusConfigPath, 'utf8')).type;
                            clearInterval(statusInterval);
                            startMultipleStatus(client, currentType, currentMessages);
                        }
                    
                        await saveStatus(
                            JSON.parse(fs.readFileSync(statusConfigPath, 'utf8')).type,
                            null,
                            true,
                            JSON.parse(fs.readFileSync(statusConfigPath, 'utf8')).multipleMessages
                        );
                    
                        await msg.edit({
                            embeds: [embed],
                            components: [modeButton, statusButtons] // Correction ici : modeButton au lieu de modeButtons
                        });
                    
                        await interaction.followUp({
                            content: `✅ Délai mis à jour à ${seconds} secondes`,
                            ephemeral: true
                        });
                        return;
                    }

                    if (interaction.customId === 'status_mode') {
                        isMultipleMode = !isMultipleMode;
                        
                        if (isMultipleMode) {
                            await interaction.reply({
                                content: 'Veuillez entrer le nombre de messages à alterner (entre 2 et 5):',
                                ephemeral: true
                            });
                    
                            const countCollected = await message.channel.awaitMessages({
                                filter: m => m.author.id === interaction.user.id,
                                max: 1,
                                time: 30000,
                                errors: ['time']
                            });
                    
                            const count = parseInt(countCollected.first().content);
                            await countCollected.first().delete().catch(() => {});
                    
                            if (isNaN(count) || count < 2 || count > 5) {
                                isMultipleMode = false;
                                messageCount = 1;
                                await interaction.followUp({
                                    content: '❌ Nombre invalide. Le mode multiple a été désactivé.',
                                    ephemeral: true
                                });
                            } else {
                                messageCount = count;
                                await interaction.followUp({
                                    content: `✅ Mode multiple activé avec ${count} messages`,
                                    ephemeral: true
                                });
                            }
                        } else {
                            messageCount = 1;
                            await interaction.reply({
                                content: '✅ Mode simple activé',
                                ephemeral: true
                            });
                        }
                        
                        // Mettre à jour le bouton de temps
                        modeButton.components[1]
                            .setDisabled(!isMultipleMode)
                            .setStyle(isMultipleMode ? ButtonStyle.Primary : ButtonStyle.Secondary);
                        
                        // Mise à jour de l'embed et des boutons
                        const updatedEmbed = EmbedBuilder.from(embed)
                            .setFields(
                                { name: 'Statut actuel', value: `Type: ${currentType}\nTexte: ${currentName}` },
                                { name: 'Mode', value: isMultipleMode ? `Multiple (${messageCount} messages)` : 'Simple' }
                            );
                    
                        // Mettre à jour le bouton de mode
                        modeButton.components[0]
                            .setLabel(isMultipleMode ? 'Mode Multiple' : 'Mode Simple')
                            .setStyle(isMultipleMode ? ButtonStyle.Success : ButtonStyle.Secondary)
                            .setEmoji(isMultipleMode ? '🔄' : '1️⃣');
                        
                        await msg.edit({
                            embeds: [updatedEmbed],
                            components: [modeButton, statusButtons]
                        });
                    
                        return;
                    }

                    // Gestion des statuts
                    const type = interaction.customId.split('_')[1];
                    const activityType = type === 'custom' ? ActivityType.Custom : {
                        'playing': ActivityType.Playing,
                        'watching': ActivityType.Watching,
                        'listening': ActivityType.Listening,
                        'competing': ActivityType.Competing
                    }[type];
                    
                    const messages = [];
                    await interaction.reply({
                        content: `Veuillez entrer ${isMultipleMode ? `${messageCount} messages` : 'le message'} (un par un):`,
                        ephemeral: true
                    });
                    
                    for (let i = 0; i < (isMultipleMode ? messageCount : 1); i++) {
                        const collected = await message.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                    
                        messages.push(collected.first().content);
                        await collected.first().delete().catch(() => {});
                    
                        if (i < messageCount - 1) {
                            await interaction.followUp({
                                content: `Message ${i + 1}/${messageCount} enregistré. Veuillez entrer le suivant:`,
                                ephemeral: true
                            });
                        }
                    }
                    
                    // Si mode multiple, démarrer la rotation des statuts
                    if (isMultipleMode) {
                        startMultipleStatus(client, activityType, messages);
                    } else {
                        if (statusInterval) {
                            clearInterval(statusInterval);
                            statusInterval = null;
                        }
                        await client.user.setPresence({
                            activities: [{
                                name: messages[0],
                                type: activityType
                            }],
                            status: 'online'
                        });
                    }
                    
                    // Une seule sauvegarde à la fin
                    await saveStatus(activityType, messages[0], isMultipleMode, messages);
            
                    const updatedEmbed = EmbedBuilder.from(embed)
                        .setFields(
                            { name: 'Statut actuel', value: `Type: ${getActivityTypeName(activityType)}\nTexte: ${isMultipleMode ? '(Multiple messages)' : messages[0]}` },
                            { name: 'Mode', value: isMultipleMode ? `Multiple (${messageCount} messages)` : 'Simple' }
                        )
                        .setColor('#00ff00');
            
                    await msg.edit({ embeds: [updatedEmbed], components: [modeButton, statusButtons] });
                    await interaction.followUp({
                        content: '✅ Statut mis à jour avec succès !',
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Erreur dans le collector:', error);
                    await interaction.followUp({
                        content: '❌ Une erreur est survenue lors de la mise à jour du statut.',
                        ephemeral: true
                    });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    const timeoutEmbed = EmbedBuilder.from(embed)
                        .setColor('#ff0000')
                        .setDescription('⏰ Le temps est écoulé. Veuillez utiliser à nouveau la commande.');
                    msg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });

        } catch (error) {
            console.error('Erreur générale:', error);
            await message.reply('❌ Une erreur est survenue lors de l\'exécution de la commande. Veuillez réessayer plus tard.');
        }
    },
};

function getActivityTypeName(type) {
    const types = {
        [ActivityType.Playing]: 'Joue à',
        [ActivityType.Watching]: 'Regarde',
        [ActivityType.Listening]: 'Écoute',
        [ActivityType.Competing]: 'Participe à',
        [ActivityType.Custom]: 'Personnalisé',
        [ActivityType.Streaming]: 'Streame'
    };
    return types[type] || 'Inconnu';
}