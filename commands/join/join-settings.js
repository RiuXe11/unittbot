const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Map pour stocker les configurations temporaires
const configInProgress = new Map();

class WelcomeSettingsModule {
    constructor() {
        this.name = 'join-settings';
        this.description = 'Configure les messages de bienvenue';
        this.customIds = {
            mainMenu: 'join-settings', 
            editMenu: 'join-settings-edit',
            deleteMenu: 'join-settings-delete',
            embedEditor: 'join-settings-embed',
            messageEditor: 'join-settings-message',
            embedSave: 'join-settings-save-embed',
            messageSave: 'join-settings-save-message'
        };
    }

    async loadConfig(guildId) {
        const configPath = path.join(__dirname, '..', '..', 'data', 'welcome-messages', `${guildId}.json`);
        try {
            const data = await fs.readFile(configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Si le fichier n'existe pas, créer une configuration par défaut
            const defaultConfig = {
                messages: [],
                embeds: []
            };
            await this.saveConfig(guildId, defaultConfig);
            return defaultConfig;
        }
    }

    async saveConfig(guildId, config) {
        // Créer le dossier data/welcome-messages s'il n'existe pas
        const configDir = path.join(__dirname, '..', '..', 'data', 'welcome-messages');
        const configPath = path.join(configDir, `${guildId}.json`);
        try {
            await fs.mkdir(configDir, { recursive: true }).catch(() => {});
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la configuration:', error);
            throw error;
        }
    }
    
    async execute(message, args) {
        if (message.reply) {
            await message.reply({
                embeds: [this.getMainMenuEmbed(message.guild)],
                components: [this.getMainMenuComponents()]
            });
        } else {
            await message.editReply({
                content: null,
                embeds: [this.getMainMenuEmbed(message.guild)],
                components: [this.getMainMenuComponents()],
                files: []
            });
        }
    }
    

    getMainMenuEmbed(guild = null) {
        return new EmbedBuilder()
            .setTitle('⚙️ | Configuration des messages de bienvenue')
            .setDescription('Sélectionnez une option pour configurer les messages de bienvenue')
            .setColor(guild ? colorManager.getColor(guild.id) : '#0099ff');
    }
    
    getMainMenuComponents() {
        return new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('join-settings')
                    .setPlaceholder('Sélectionnez une option')
                    .addOptions([
                        {
                            label: '➕ | Ajouter un embed',
                            value: 'add_embed',
                            description: '👉 Créer un nouvel embed de bienvenue',
                        },
                        {
                            label: '➕ | Ajouter un message',
                            value: 'add_message',
                            description: '👉 Créer un message personnalisé',
                        },
                        {
                            label: '📝 | Modifier un message',
                            value: 'edit_message',
                            description: '👉 Modifier un embed ou message existant',
                        },
                        {
                            label: '❌ | Supprimer un message',
                            value: 'delete_message',
                            description: '👉 Supprimer un embed ou message',
                        },
                    ])
            );
    }

    // === MENUS PRINCIPAUX ===
    async showMainMenu(messageOrInteraction) {
        if (messageOrInteraction.replied || messageOrInteraction.deferred) {
            return await messageOrInteraction.editReply({
                content: null,
                embeds: [this.getMainMenuEmbed(messageOrInteraction.guild)],
                components: [this.getMainMenuComponents()],
                files: []
            });
        } else {
            return await messageOrInteraction.reply({
                embeds: [this.getMainMenuEmbed(messageOrInteraction.guild)],
                components: [this.getMainMenuComponents()]
            });
        }
    }

    async handleMainMenuSelection(interaction) {
        try {
            console.log('Menu selection:', interaction.values[0]);
            const selection = interaction.values[0];
            
            switch (selection) {
                case 'add_embed':
                    // Pour un nouvel embed, on commence avec une config vide
                    configInProgress.delete(interaction.user.id); // On efface toute ancienne config
                    await this.showEmbedEditor(interaction);
                    break;
    
                case 'add_message':
                    // Pour un nouveau message, on commence avec une config vide
                    configInProgress.delete(interaction.user.id); // On efface toute ancienne config
                    await this.showMessageEditor(interaction);
                    break;
    
                case 'edit_message':
                case 'delete_message':
                    const mode = selection === 'edit_message' ? 'edit' : 'delete';
                    await this.showMessageList(interaction, mode);
                    break;
    
                default:
                    await interaction.editReply({
                        content: 'Option non reconnue.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Erreur dans handleMainMenuSelection:', error);
            await this.handleError(interaction);
        }
    }

    async showMessageList(interaction, mode) {
        try {
            const config = await this.loadConfig(interaction.guildId);
            const { messages, embeds } = config;
    
            if (messages.length === 0 && embeds.length === 0) {
                // Ajouter un bouton de retour même quand il n'y a pas de messages
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('return-to-menu')
                            .setLabel('Retourner au menu')
                            .setStyle(ButtonStyle.Secondary)
                    );
    
                return await interaction.editReply({
                    content: 'Aucun message configuré.',
                    ephemeral: true,
                    components: [row]
                });
            }
    
            const listEmbed = new EmbedBuilder()
                .setTitle(mode === 'edit' ? '📝 | Modifier un message' : '❌ | Supprimer un message')
                .setColor(interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff');
    
            const options = [
                ...messages.map((msg, index) => ({
                    label: `📝 | Message #${index + 1}`,
                    value: `message_${index}`,
                    description: msg.content?.substring(0, 100) || 'Message sans contenu'
                })),
                ...embeds.map((embed, index) => ({
                    label: `🗒️ | Embed #${index + 1}`,
                    value: `embed_${index}`,
                    description: embed.title || 'Embed sans titre'
                }))
            ];
    
            // Créer une rangée pour le menu de sélection
            const selectionRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(mode === 'edit' ? this.customIds.editMenu : this.customIds.deleteMenu)
                        .setPlaceholder('Sélectionnez un message')
                        .addOptions(options)
                );
    
            await interaction.editReply({
                embeds: [listEmbed],
                components: [selectionRow] // Ajouter les deux rangées
            });
    
        } catch (error) {
            console.error('Erreur dans showMessageList:', error);
            await this.handleError(interaction);
        }
    }

    async showEmbedEditor(interaction, config = null) {
        let embedConfig = config || configInProgress.get(interaction.user.id) || {
            type: 'embed',
            channelId: null,
            title: 'Bienvenue !',
            description: 'Bienvenue {user} sur {server} !',
            color: interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff',
            footer: null,
            timestamp: false,
            image: null
        };
    
        configInProgress.set(interaction.user.id, embedConfig);
    
        const previewEmbed = new EmbedBuilder()
            .setTitle('Configuration de l\'embed de bienvenue')
            .setColor(interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff')
            .addFields(
                { name: 'Salon', value: embedConfig.channelId ? `<#${embedConfig.channelId}>` : 'Non défini', inline: true },
                { name: 'Titre', value: embedConfig.title || 'Non défini', inline: true },
                { name: 'Couleur', value: embedConfig.color || '#0099ff', inline: true },
                { name: 'Description', value: embedConfig.description || 'Non définie' },
                { name: 'Footer', value: embedConfig.footer || 'Non défini', inline: true },
                { name: 'Timestamp', value: embedConfig.timestamp ? 'Activé' : 'Désactivé', inline: true },
                { name: 'Image', value: embedConfig.image ? '✅ Image configurée' : '❌ Pas d\'image', inline: true }
            );

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-channel')
                    .setLabel('Modifier le salon')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-title')
                    .setLabel('Modifier le titre')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-color')
                    .setLabel('Modifier la couleur')
                    .setStyle(ButtonStyle.Primary)
            );
    
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-description')
                    .setLabel('Modifier la description')
                    .setStyle(ButtonStyle.Secondary)
            );
    
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-footer')
                    .setLabel('Modifier le footer')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-timestamp')
                    .setLabel('Toggle timestamp')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('join-settings-embed-image')
                    .setLabel('Modifier l\'image')
                    .setStyle(ButtonStyle.Secondary)
            );
    
        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-save-embed')
                    .setLabel('Sauvegarder')
                    .setStyle(ButtonStyle.Success)
            );

        if (embedConfig.image) {
            const imagePath = path.join(__dirname, '..', '..', 'data', 'welcome-images', embedConfig.image);
            try {
                await fs.access(imagePath);
                previewEmbed.setImage(`attachment://${embedConfig.image}`);
                return await interaction.editReply({
                    embeds: [previewEmbed],
                    components: [row1, row2, row3, row4],
                    files: [imagePath]
                });
            } catch (error) {
                embedConfig.image = null;
                // Mettre à jour le statut de l'image dans les fields
                previewEmbed.data.fields[6] = { 
                    name: 'Image', 
                    value: '❌ Pas d\'image', 
                    inline: true 
                };
            }
        }
        
        await interaction.editReply({
            embeds: [previewEmbed],
            components: [row1, row2, row3, row4]
        });
    }

    async showMessageEditor(interaction, messageConfig = null) {
        const config = messageConfig || {
            type: 'message',
            channelId: null,
            content: 'Bienvenue {user} sur {server} !'
        };

        configInProgress.set(interaction.user.id, config);

        const previewEmbed = new EmbedBuilder()
            .setTitle('Configuration du message de bienvenue')
            .setColor(interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff')
            .addFields(
                { name: 'Salon', value: config.channelId ? `<#${config.channelId}>` : 'Non défini', inline: true },
                { name: 'Message', value: config.content || 'Non défini' }
            );

        const rowMessage1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-message-channel')
                    .setLabel('Modifier le salon')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('join-settings-message-content')
                    .setLabel('Modifier le message')
                    .setStyle(ButtonStyle.Primary)
            );

        const rowMessage2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('join-settings-save-message')
                    .setLabel('Sauvegarder')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.editReply({
            embeds: [previewEmbed],
            components: [rowMessage1, rowMessage2]
        });
    }

    async handleMessageEdit(interaction, action) {
        const messageConfig = configInProgress.get(interaction.user.id);
    
        if (!messageConfig) {
            return await interaction.followUp({
                content: 'Session expirée. Veuillez recommencer.',
                ephemeral: true
            });
        }
    
        const promptEmbed = new EmbedBuilder()
            .setColor(interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff')
            .setTitle('Modification du message');
    
        switch (action) {
            case 'channel':
                promptEmbed
                    .setDescription('👉 Mentionnez le salon où sera envoyé le message de bienvenue')
                    .setFooter({ text: '💡 Exemple: #general' });
                break;
            case 'content':
                promptEmbed
                    .setDescription('👉 Entrez le nouveau message\n\n{user} = mention de l\'utilisateur\n{server} = nom du serveur')
                    .setFooter({ text: '💡 Exemple: Bienvenue {user} sur {server} !' });
                break;
            default:
                promptEmbed
                    .setDescription('Action non reconnue');
                break;
        }
    
        try {
            await interaction.editReply({
                embeds: [promptEmbed],
                components: []
            });
    
            if (action === 'default') return;
    
            const filter = m => m.author.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000
            });
    
            const response = collected.first();
            if (response) {
                if (action === 'channel') {
                    const channel = response.mentions.channels.first();
                    if (!channel || channel.type !== ChannelType.GuildText) {
                        await interaction.followUp({ 
                            content: 'Salon invalide! Veuillez mentionner un salon textuel.', 
                            ephemeral: true 
                        });
                        return;
                    }
                    messageConfig.channelId = channel.id;
                } else if (action === 'content') {
                    messageConfig.content = response.content;
                }
    
                await response.delete().catch(() => {});
                await this.showMessageEditor(interaction, messageConfig);
            }
        } catch (error) {
            console.error('Erreur dans handleMessageEdit:', error);
            await interaction.followUp({ 
                content: 'Temps écoulé ou une erreur est survenue!', 
                ephemeral: true 
            });
        }
    }

    async handleMessageSelection(interaction, mode) {
        try {
            const [type, indexStr] = interaction.values[0].split('_');
            const index = parseInt(indexStr);
            const config = await this.loadConfig(interaction.guildId);
    
            if (mode === 'edit') {
                // Charger la configuration existante pour l'édition
                if (type === 'embed') {
                    const embedConfig = {
                        ...config.embeds[index],
                        originalIndex: index
                    };
                    configInProgress.set(interaction.user.id, embedConfig);
                    await this.showEmbedEditor(interaction, embedConfig);
                } else {
                    const messageConfig = {
                        ...config.messages[index],
                        originalIndex: index
                    };
                    configInProgress.set(interaction.user.id, messageConfig);
                    await this.showMessageEditor(interaction, messageConfig);
                }
            } else if (mode === 'delete') {
                // Confirmation de suppression
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('Confirmation de suppression')
                    .setDescription('Êtes-vous sûr de vouloir supprimer ce message ?')
                    .setColor('#ff0000');
    
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`confirm-delete_${type}_${index}`)
                            .setLabel('Confirmer')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('cancel-delete')
                            .setLabel('Annuler')
                            .setStyle(ButtonStyle.Secondary)
                    );
    
                await interaction.editReply({
                    embeds: [confirmEmbed],
                    components: [row]
                });
            }
        } catch (error) {
            console.error('Erreur dans handleMessageSelection:', error);
            await this.handleError(interaction);
        }
    }

    async handleInteraction(interaction) {
        try {
            // Si l'interaction n'est pas différée, la différer
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate().catch(e => console.error('Erreur lors du defer:', e));
            }
    
            // Gérer les menus de sélection
            if (interaction.isStringSelectMenu()) {
                if (interaction.customId === this.customIds.mainMenu) {
                    await this.handleMainMenuSelection(interaction);
                }
                else if (interaction.customId === this.customIds.editMenu) {
                    await this.handleMessageSelection(interaction, 'edit');
                }
                else if (interaction.customId === this.customIds.deleteMenu) {
                    await this.handleMessageSelection(interaction, 'delete');
                }
            }
            // Gérer les boutons
            else if (interaction.isButton()) {
                const buttonId = interaction.customId;
    
                // Gérer le retour au menu
                if (buttonId === 'return-to-menu') {
                    await interaction.editReply({
                        content: null,
                        embeds: [this.getMainMenuEmbed(interaction.guild)],
                        components: [this.getMainMenuComponents()],
                        files: []
                    });
                    return;
                }

                // Gérer les autres boutons
                else if (buttonId.startsWith('confirm-delete_')) {
                    const [_, type, index] = buttonId.split('_');
                    await this.deleteMessage(interaction, type, parseInt(index));
                }
                else if (buttonId === 'cancel-delete') {
                    await interaction.editReply({
                        content: 'Suppression annulée.',
                        embeds: [],
                        components: []
                    });
                }
                else if (buttonId === 'join-settings-save-embed') {
                    await this.handleSave(interaction);
                }
                else if (buttonId === 'join-settings-save-message') {
                    await this.handleSave(interaction);
                }
                else if (buttonId.startsWith('join-settings-embed-')) {
                    const action = buttonId.replace('join-settings-embed-', '');
                    await this.handleEmbedEdit(interaction, action);
                }
                else if (buttonId.startsWith('join-settings-message-')) {
                    const action = buttonId.replace('join-settings-message-', '');
                    await this.handleMessageEdit(interaction, action);
                }
            }
        } catch (error) {
            console.error('Erreur dans handleInteraction:', error);
            await interaction.followUp({
                content: 'Une erreur est survenue. Utilisez la commande !join-settings pour recommencer.',
                ephemeral: true
            }).catch(console.error);
        }
    }

    async handleEmbedEdit(interaction, action) {
        console.log('Action reçue dans handleEmbedEdit:', action); // Pour le debug
        const embedConfig = configInProgress.get(interaction.user.id);
    
        if (!embedConfig) {
            return await interaction.followUp({
                content: 'Session expirée. Veuillez recommencer.',
                ephemeral: true
            });
        }
    
        if (action === 'timestamp') {
            embedConfig.timestamp = !embedConfig.timestamp;
            await this.showEmbedEditor(interaction);
            return;
        }
    
        const previewEmbed = new EmbedBuilder()
        .setColor(interaction.guild ? colorManager.getColor(interaction.guild.id) : '#0099ff')
            .setTitle('Configuration de l\'embed de bienvenue');
        
        switch (action) {
            case 'channel':
                previewEmbed
                    .setDescription('👉 Mentionnez le salon où sera envoyé l\'embed')
                    .setFooter({ text: '💡 Exemple: #general' });
                break;
            case 'title':
                previewEmbed
                    .setDescription('👉 Entrez le nouveau titre')
                    .setFooter({ text: '💡 Le titre apparaîtra en haut de l\'embed' });
                break;
            case 'description':
                previewEmbed
                    .setDescription('👉 Entrez la nouvelle description\n{user} = mention de l\'utilisateur\n{server} = nom du serveur')
                    .setFooter({ text: '💡 Exemple: Bienvenue {user} sur {server} !' });
                break;
            case 'color':
                previewEmbed
                    .setDescription('👉 Entrez le code couleur hexadécimal')
                    .setFooter({ text: '💡 Exemple: #0099ff' });
                break;
            case 'footer':
                previewEmbed
                    .setDescription('👉 Entrez le nouveau texte du footer')
                    .setFooter({ text: '💡 Le texte apparaîtra en bas de l\'embed' });
                break;
            case 'image':
                previewEmbed
                    .setTitle('Modification de l\'image')
                    .setDescription('👉 Envoyez le lien de l\'image ou tapez "supprimer" pour retirer l\'image\nVous pouvez aussi uploader directement une image.')
                    .setFooter({ text: '💡 Formats acceptés: jpg, jpeg, png, webp, gif' });
                break;
            default:
                previewEmbed
                    .setTitle('Erreur')
                    .setDescription('Action non reconnue');
                break;
        }
    
        try {
            await interaction.editReply({
                embeds: [previewEmbed],
                components: []
            });
    
            if (action === 'default') {
                return;
            }
    
            const messageFilter = m => m.author.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessages({
                filter: messageFilter,
                max: 1,
                time: 30000
            });
    
            const response = collected.first();
            if (response) {
                if (action === 'image') {
                    if (response.attachments.size > 0) {
                        const attachment = response.attachments.first();
                        const imagePath = await this.handleImageUpload(interaction, attachment);
                        if (imagePath) {
                            if (embedConfig.image) {
                                await this.deleteImage(embedConfig.image);
                            }
                            embedConfig.image = imagePath;
                        } else {
                            await interaction.followUp({
                                content: 'Erreur lors du téléchargement de l\'image.',
                                ephemeral: true
                            });
                        }
                    } else if (response.content.toLowerCase() === 'supprimer') {
                        if (embedConfig.image) {
                            await this.deleteImage(embedConfig.image);
                        }
                        embedConfig.image = null;
                    } else {
                        const imagePath = await this.handleImageUpload(interaction, response.content);
                        if (imagePath) {
                            if (embedConfig.image) {
                                await this.deleteImage(embedConfig.image);
                            }
                            embedConfig.image = imagePath;
                        }
                    }
                } else {
                    await this.updateEmbedConfig(embedConfig, action, response);
                }
                await response.delete().catch(() => {});
            }
    
            // Appeler showEmbedEditor après avoir traité toutes les actions
            await this.showEmbedEditor(interaction);
    
        } catch (error) {
            console.error('Erreur dans handleEmbedEdit:', error);
            await interaction.followUp({
                content: 'Temps écoulé ou une erreur est survenue!',
                ephemeral: true
            });
            // En cas d'erreur, on retourne quand même à l'éditeur
            await this.showEmbedEditor(interaction);
        }
    }

    async updateEmbedConfig(embedConfig, action, response) {
        switch (action) {
            case 'channel':
                const channel = response.mentions.channels.first();
                if (channel && channel.type === ChannelType.GuildText) {
                    embedConfig.channelId = channel.id;
                }
                break;
            case 'title':
                embedConfig.title = response.content;
                break;
            case 'description':
                embedConfig.description = response.content;
                break;
            case 'color':
                if (/^#[0-9A-F]{6}$/i.test(response.content)) {
                    embedConfig.color = response.content;
                }
                break;
            case 'footer':
                embedConfig.footer = response.content;
                break;
            case 'image':
                if (response.content.toLowerCase() === 'supprimer') {
                    embedConfig.image = null;
                } else {
                    const imageUrl = this.isValidImageUrl(response.content);
                    if (imageUrl) {
                        embedConfig.image = imageUrl;
                    }
                }
                break;
        }
    }

    async handleSave(interaction) {
        const config = configInProgress.get(interaction.user.id);
        if (!config) {
            return await interaction.followUp({
                content: 'Session expirée. Veuillez recommencer.',
                ephemeral: true
            });
        }
    
        if (!config.channelId) {
            return await interaction.followUp({
                content: 'Veuillez sélectionner un salon avant de sauvegarder.',
                ephemeral: true
            });
        }
    
        try {
            const guildConfig = await this.loadConfig(interaction.guildId);
    
            if (config.type === 'embed') {
                const saveConfig = {
                    type: 'embed',
                    channelId: config.channelId,
                    title: config.title || 'Bienvenue !',
                    description: config.description || 'Bienvenue {user} sur {server} !',
                    color: config.color || '#0099ff',
                    footer: config.footer || null,
                    timestamp: config.timestamp || false,
                    image: config.image || null
                };
    
                if ('originalIndex' in config) {
                    guildConfig.embeds[config.originalIndex] = saveConfig;
                } else {
                    guildConfig.embeds.push(saveConfig);
                }
    
                await this.saveConfig(interaction.guildId, guildConfig);
                await this.saveConfigAndShowPreview(interaction, saveConfig, guildConfig);
            } else if (config.type === 'message') {
                const saveConfig = {
                    type: 'message',
                    channelId: config.channelId,
                    content: config.content || 'Bienvenue {user} sur {server} !'
                };
    
                if ('originalIndex' in config) {
                    guildConfig.messages[config.originalIndex] = saveConfig;
                } else {
                    guildConfig.messages.push(saveConfig);
                }
    
                await this.saveConfig(interaction.guildId, guildConfig);
                await this.saveConfigAndShowMessagePreview(interaction, saveConfig, guildConfig);
            }
    
        } catch (error) {
            console.error('Erreur lors de la sauvegarde:', error);
            await this.handleError(interaction);
        }
    }

    async saveConfigAndShowPreview(interaction, saveConfig, guildConfig) {
        const successEmbed = new EmbedBuilder()
            .setTitle('Configuration terminée')
            .setDescription('L\'embed de bienvenue a été enregistré avec succès !')
            .setColor('#00ff00');
    
        const previewEmbed = new EmbedBuilder()
            .setTitle(saveConfig.title)
            .setDescription(
                saveConfig.description
                    .replace(/{user}/g, interaction.user.toString())
                    .replace(/{server}/g, interaction.guild.name)
            )
            .setColor(saveConfig.color);
    
        if (saveConfig.footer) {
            previewEmbed.setFooter({ text: saveConfig.footer });
        }
    
        let files = [];
    
        // Gestion de l'image
        if (saveConfig.image) {
            const imagePath = path.join(__dirname, '..', '..', 'data', 'welcome-images', saveConfig.image);
            try {
                await fs.access(imagePath);
                files = [{ attachment: imagePath, name: saveConfig.image }];
                previewEmbed.setImage(`attachment://${saveConfig.image}`);
            } catch (error) {
                console.error('Image non trouvée:', error);
                saveConfig.image = null;
                if ('originalIndex' in configInProgress.get(interaction.user.id)) {
                    const index = configInProgress.get(interaction.user.id).originalIndex;
                    guildConfig.embeds[index].image = null;
                }
            }
        }
    
        if (saveConfig.timestamp) {
            previewEmbed.setTimestamp();
        }
    
        // Ajout du bouton retour au menu
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('return-to-menu')
                    .setLabel('Retourner au menu')
                    .setStyle(ButtonStyle.Secondary)
            );
    
        try {
            await this.saveConfig(interaction.guildId, guildConfig);
    
            await interaction.editReply({
                content: 'Voici un aperçu du message de bienvenue :',
                embeds: [successEmbed, previewEmbed],
                files: files,
                components: [row]
            });
    
            configInProgress.delete(interaction.user.id);
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la configuration:', error);
            await this.handleError(interaction);
        }
    }

    async handleImageUpload(interaction, attachmentOrUrl) {
        const imagesDir = path.join(__dirname, '..', '..', 'data', 'welcome-images');
        
        try {
            await fs.mkdir(imagesDir, { recursive: true });
    
            let imageUrl;
            if (typeof attachmentOrUrl === 'string') {
                // Vérifier si l'URL est valide
                if (!this.isValidImageUrl(attachmentOrUrl)) {
                    throw new Error('URL d\'image invalide');
                }
                imageUrl = attachmentOrUrl;
            } else if (attachmentOrUrl?.url) {
                imageUrl = attachmentOrUrl.url;
            } else {
                throw new Error('Format d\'image invalide');
            }
    
            // Nettoyer l'URL et vérifier l'extension
            const cleanUrl = imageUrl.split('?')[0];
            const extension = path.extname(cleanUrl).toLowerCase();
            if (!extension || !['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
                throw new Error('Format d\'image non supporté');
            }
    
            const filename = `${interaction.guildId}_${Date.now()}${extension}`;
            const localPath = path.join(imagesDir, filename);
    
            const response = await axios({
                method: 'get',
                url: imageUrl,
                responseType: 'arraybuffer',
                maxContentLength: 8 * 1024 * 1024, // 8MB limit
                validateStatus: status => status === 200
            });
    
            // Vérification supplémentaire du type de contenu
            const contentType = response.headers['content-type'];
            if (!contentType || !contentType.startsWith('image/')) {
                throw new Error('Le fichier téléchargé n\'est pas une image');
            }
    
            await fs.writeFile(localPath, Buffer.from(response.data));
            console.log('Image sauvegardée:', filename);
            
            return filename;
        } catch (error) {
            console.error('Erreur lors du téléchargement de l\'image:', error);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Headers:', error.response.headers);
            }
            return null;
        }
    }

    async deleteImage(imagePath) {
        if (!imagePath) return;
        
        try {
            const fullPath = path.join(__dirname, '..', '..', 'data', 'welcome-images', imagePath);
            await fs.unlink(fullPath).catch(() => {});
        } catch (error) {
            console.error('Erreur lors de la suppression de l\'image:', error);
        }
    }

    async saveConfigAndShowMessagePreview(interaction, saveConfig, guildConfig) {
        const successEmbed = new EmbedBuilder()
            .setTitle('Configuration terminée')
            .setDescription('Le message de bienvenue a été enregistré avec succès !')
            .setColor('#00ff00');
    
        const previewText = saveConfig.content
            .replace(/{user}/g, interaction.user.toString())
            .replace(/{server}/g, interaction.guild.name);
    
        // Ajout du bouton retour au menu
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('return-to-menu')
                    .setLabel('Retourner au menu')
                    .setStyle(ButtonStyle.Secondary)
            );
    
        await interaction.editReply({
            embeds: [successEmbed],
            content: `Aperçu du message :\n${previewText}`,
            components: [row]
        });
    
        configInProgress.delete(interaction.user.id);
    }

    async deleteMessage(interaction, type, index) {
        try {
            const config = await this.loadConfig(interaction.guildId);
            const collection = type === 'embed' ? config.embeds : config.messages;
            
            if (index >= 0 && index < collection.length) {
                const item = collection[index];
                // Supprimer l'image si c'est un embed avec une image
                if (type === 'embed' && item.image) {
                    await this.deleteImage(item.image);
                }
                
                collection.splice(index, 1);
                await this.saveConfig(interaction.guildId, config);
    
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('return-to-menu')
                            .setLabel('Retourner au menu')
                            .setStyle(ButtonStyle.Secondary)
                    );
    
                await interaction.editReply({
                    content: `Le ${type === 'embed' ? 'message embed' : 'message'} a été supprimé avec succès !`,
                    embeds: [],
                    components: [row]
                });
            } else {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('return-to-menu')
                            .setLabel('Retourner au menu')
                            .setStyle(ButtonStyle.Secondary)
                    );
    
                await interaction.editReply({
                    content: 'Message introuvable.',
                    components: [row]
                });
            }
        } catch (error) {
            console.error('Erreur lors de la suppression:', error);
            await this.handleError(interaction);
        }
    }

    async handleError(interaction) {
        const errorMessage = 'Une erreur est survenue lors du traitement de votre demande.';
        try {
            if (interaction.replied) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message d\'erreur:', error);
        }
    }

    isValidImageUrl(url) {
        try {
            if (!url) return false;
            
            // Vérifier si c'est un fichier local
            if (url.includes('\\') || url.includes('/')) {
                return false;
            }
    
            const urlObj = new URL(url);
            const allowedDomains = [
                'cdn.discordapp.com',
                'media.discordapp.net',
                'i.imgur.com'
            ];
    
            // Vérifier le domaine et l'extension
            return allowedDomains.includes(urlObj.hostname) &&
                   /\.(jpg|jpeg|png|webp|gif)$/i.test(urlObj.pathname);
        } catch {
            return false;
        }
    }
}

module.exports = new WelcomeSettingsModule();