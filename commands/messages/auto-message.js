const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Configuration et gestion des fichiers
class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '../../data/auto-message/config.json');
        this.configDir = path.dirname(this.configPath);
        this.messageConfigs = {};
        this.initializeConfig();
    }

    initializeConfig() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        if (!fs.existsSync(this.configPath)) {
            fs.writeFileSync(this.configPath, JSON.stringify({ messages: {} }, null, 2));
        }
        this.loadConfig();
    }

    loadConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            this.messageConfigs = JSON.parse(data).messages;
        } catch (error) {
            console.error('Erreur lors du chargement de la configuration:', error);
            this.messageConfigs = {};
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify({ messages: this.messageConfigs }, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la configuration:', error);
        }
    }
}

// Gestionnaire des messages automatiques
class AutoMessageManager {
    constructor() {
        this.lastMessages = new Map();
        this.currentConfig = new Map();
        this.configManager = new ConfigManager();
        this.messageTimeouts = new Map();
        this.initializeLastMessages();
    }

    async initializeLastMessages() {
        try {
            // Charger les configurations
            this.configManager.loadConfig();
            
            // Pour chaque configuration, initialiser lastMessages avec l'ID sauvegardé
            for (const [configId, config] of Object.entries(this.configManager.messageConfigs)) {
                if (config.lastMessageId) {
                    this.lastMessages.set(config.channelId, {
                        id: config.lastMessageId,
                        timestamp: config.lastMessageTimestamp || Date.now()
                    });
                }
            }
        } catch (error) {
            console.error('Erreur lors de l\'initialisation des derniers messages:', error);
        }
    }

    async sendMessage(channel, config) {
        try {
            let messageToSend;
            if (config.isEmbed) {
                const embed = new EmbedBuilder()
                .setColor(config.color || colorManager.getColor(channel.guild.id));
    
                // N'ajouter le titre que s'il existe et n'est pas vide
                if (config.title && config.title.trim() !== '') {
                    embed.setTitle(config.title);
                }
    
                // La description est obligatoire pour les embeds
                embed.setDescription(config.description || 'Message automatique');
    
                // Ajouter les autres champs optionnels seulement s'ils existent
                if (config.image && config.image.trim() !== '') {
                    embed.setImage(config.image);
                }
                if (config.footer && config.footer.trim() !== '') {
                    embed.setFooter({ text: config.footer });
                }
                if (config.timestamp) {
                    embed.setTimestamp();
                }
    
                messageToSend = { embeds: [embed] };
            } else {
                messageToSend = { 
                    content: config.description || 'Message automatique'
                };
            }
    
            const sentMessage = await channel.send(messageToSend);
            
            // Sauvegarder l'ID du message dans la configuration
            for (const [configId, cfg] of Object.entries(this.configManager.messageConfigs)) {
                if (cfg.channelId === channel.id) {
                    cfg.lastMessageId = sentMessage.id;
                    cfg.lastMessageTimestamp = Date.now();
                    this.configManager.saveConfig();
                    break;
                }
            }
    
            return sentMessage;
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message:', error);
            return null;
        }
    }

    async deleteLastMessage(channelId, channel) {
        try {
            const lastMessage = this.lastMessages.get(channelId);
            if (lastMessage) {
                const oldMessage = await channel.messages.fetch(lastMessage.id)
                    .catch(() => null);
                
                if (oldMessage) {
                    await oldMessage.delete()
                        .catch(error => console.error('Erreur lors de la suppression:', error));
                }
                this.lastMessages.delete(channelId);
            }
        } catch (error) {
            console.error('Erreur lors de la suppression du dernier message:', error);
        }
    }

    async handleAutoMessage(message) {
        try {
            if (message.author.bot) return;

            this.configManager.loadConfig();
            const config = Object.values(this.configManager.messageConfigs)
                .find(cfg => cfg.channelId === message.channel.id);
            
            if (!config || !config.repeat) return;

            // Vérifier d'abord le message sauvegardé dans la configuration
            if (config.lastMessageId) {
                try {
                    const oldMessage = await message.channel.messages.fetch(config.lastMessageId)
                        .catch(() => null);
                    if (oldMessage) {
                        await oldMessage.delete()
                            .catch(error => console.error('Erreur lors de la suppression:', error));
                    }
                } catch (error) {
                    console.error('Erreur lors de la suppression du message:', error);
                }
            }

            // Attendre un court instant
            await new Promise(resolve => setTimeout(resolve, 500));

            // Envoyer le nouveau message
            const newMessage = await this.sendMessage(message.channel, config);
            if (newMessage) {
                this.lastMessages.set(message.channel.id, {
                    id: newMessage.id,
                    timestamp: Date.now()
                });

                // Mettre à jour la configuration avec le nouvel ID
                config.lastMessageId = newMessage.id;
                config.lastMessageTimestamp = Date.now();
                this.configManager.saveConfig();
            }

        } catch (error) {
            console.error('Erreur dans handleAutoMessage:', error);
        }
    }

    async handleInteraction(interaction, messageManager) {
        try {
            const [prefix, field, subfield] = interaction.customId.split('-');
    
            if (prefix !== 'msg') return;
    
            const handleError = async (error, message = 'Une erreur est survenue.') => {
                console.error('Erreur:', error);
                try {
                    if (interaction.message && !interaction.replied) {
                        await interaction.message.edit({
                            content: message,
                            components: []
                        });
                    }
                } catch (e) {
                    console.error('Erreur lors de la gestion d\'erreur:', e);
                }
            };
    
            // Gérer les entrées de texte séparément
            if (['title', 'desc', 'color', 'image', 'footer'].includes(field)) {
                return await this.handleMessageInput(interaction, field, messageManager)
                    .catch(error => handleError(error, 'Erreur lors de la saisie du texte.'));
            }
    
            const config = this.currentConfig.get(interaction.user.id) || {
                channelId: null,
                channelName: null,
                repeat: false,
                isEmbed: true,
                title: '',
                description: '',
                color: colorManager.getColor(interaction.guild.id),
                image: '',
                footer: '',
                timestamp: false
            };
    
            // Vérifier les conditions de sauvegarde avant le switch
            if (field === 'save' && (!config.channelId || !config.description)) {
                await interaction.message.edit({
                    content: 'Veuillez remplir tous les champs obligatoires avant de sauvegarder.',
                    components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig).components
                });
                return;
            }
    
            // Traiter l'action et préparer la réponse
            let messageContent;
            switch (field) {
                case 'add':
                    this.currentConfig.set(interaction.user.id, config);
                    messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                    break;

                case 'modify':
                    if (subfield === 'select') {
                        const messageId = interaction.values[0];
                        const configToModify = this.configManager.messageConfigs[messageId];
                        
                        if (configToModify) {
                            // Copier la configuration existante dans currentConfig
                            this.currentConfig.set(interaction.user.id, {
                                ...configToModify,
                                _messageId: messageId // Stocker l'ID pour la mise à jour ultérieure
                            });
                            messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                        }
                    } else {
                        // Créer le menu de sélection pour la modification
                        messageContent = {
                            content: 'Sélectionnez le message à modifier :',
                            components: [
                                new ActionRowBuilder()
                                    .addComponents(
                                        new StringSelectMenuBuilder()
                                            .setCustomId('msg-modify-select')
                                            .setPlaceholder('Sélectionnez un message')
                                            .addOptions(
                                                Object.entries(this.configManager.messageConfigs).map(([id, cfg]) => ({
                                                    label: `Message dans #${cfg.channelName}`,
                                                    value: id,
                                                    description: `${cfg.isEmbed ? 'Embed' : 'Message'} ${cfg.repeat ? '(Répétition activée)' : ''}`
                                                }))
                                            )
                                    ),
                                new ActionRowBuilder()
                                    .addComponents(
                                        new ButtonBuilder()
                                            .setCustomId('msg-return')
                                            .setLabel('Retour')
                                            .setStyle(ButtonStyle.Secondary)
                                    )
                            ]
                        };
                    }
                    break;

                case 'delete':
                    if (subfield === 'select') {
                        const messageId = interaction.values[0];
                        const configToDelete = this.configManager.messageConfigs[messageId];
                        
                        if (configToDelete) {
                            // Supprimer le dernier message du salon
                            const channel = interaction.guild.channels.cache.get(configToDelete.channelId);
                            if (channel) {
                                const lastMessage = this.lastMessages.get(channel.id);
                                if (lastMessage) {
                                    try {
                                        const oldMessage = await channel.messages.fetch(lastMessage.id)
                                            .catch(() => null);
                                        if (oldMessage) {
                                            await oldMessage.delete();
                                        }
                                    } catch (error) {
                                        console.error('Erreur lors de la suppression du message:', error);
                                    }
                                }
                            }
                            
                            // Nettoyer les références
                            this.lastMessages.delete(configToDelete.channelId);
                            delete this.configManager.messageConfigs[messageId];
                            this.configManager.saveConfig();
                        }
                        
                        messageContent = messageManager.createMainMenu(this.configManager.messageConfigs, interaction.guild);
                    } else {
                        messageContent = messageManager.createDeleteMenu(this.configManager.messageConfigs);
                    }
                    break;

                case 'return':
                    // Retourner au menu principal
                    messageContent = messageManager.createMainMenu(this.configManager.messageConfigs, interaction.guild);
                    break;
    
                case 'channel':
                    await interaction.message.edit({
                        content: 'Mentionnez le salon où l\'auto-message sera activé (exemple: #general) :',
                        components: []
                    });
                
                    try {
                        const filter = m => m.author.id === interaction.user.id && m.mentions.channels.size > 0;
                        const collected = await interaction.channel.awaitMessages({
                            filter,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                
                        const message = collected.first();
                        if (!message) {
                            await interaction.message.edit({
                                content: 'Temps écoulé. Veuillez réessayer.',
                                components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild).components
                            });
                            return;
                        }
                
                        const channel = message.mentions.channels.first();
                        config.channelId = channel.id;
                        config.channelName = channel.name;
                        this.currentConfig.set(interaction.user.id, config);
                
                        await message.delete().catch(() => {});
                        messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                    } catch (error) {
                        console.error('Erreur lors de la sélection du salon:', error);
                        messageContent = {
                            content: 'Une erreur est survenue. Veuillez réessayer.',
                            components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig).components
                        };
                    }
                    break;
                
                case 'repeat':
                    config.repeat = !config.repeat;
                    this.currentConfig.set(interaction.user.id, config);
                    messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                    break;
                
                case 'type':
                    // Inverser l'état actuel
                    const newIsEmbed = !config.isEmbed;
                    config.isEmbed = newIsEmbed;
                    
                    // Si on passe de message à embed, initialiser les valeurs par défaut pour embed
                    if (newIsEmbed) {
                        config.color = config.color || colorManager.getColor(message?.guild?.id);
                        config.timestamp = false;
                    }
                    
                    this.currentConfig.set(interaction.user.id, config);
                    messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                    break;
                
                case 'timestamp':
                    if (config.isEmbed) {
                        config.timestamp = !config.timestamp;
                        this.currentConfig.set(interaction.user.id, config);
                        messageContent = messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild);
                    }
                    break;

                    case 'save':
                        if (!config.channelId || !config.description) {
                            await interaction.message.edit({
                                content: 'Veuillez remplir tous les champs obligatoires avant de sauvegarder.',
                                components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig, interaction.guild).components
                            });
                            return;
                        }
                        
                        // Récupérer l'ID du message si c'est une modification
                        const messageId = config._messageId;
                        delete config._messageId; // Nettoyer l'ID temporaire
                        
                        // Sauvegarder la configuration
                        if (messageId && this.configManager.messageConfigs[messageId]) {
                            // Mise à jour d'une configuration existante
                            this.configManager.messageConfigs[messageId] = config;
                        } else {
                            // Nouvelle configuration
                            this.configManager.messageConfigs[interaction.message.id] = config;
                        }
                        
                        this.configManager.saveConfig();
                        this.currentConfig.delete(interaction.user.id);
                        
                        // Envoyer/Mettre à jour l'embed dans le salon configuré
                        try {
                            const channel = interaction.guild.channels.cache.get(config.channelId);
                            if (channel) {
                                // Vérifier si un message existe déjà
                                if (config.lastMessageId) {
                                    try {
                                        const oldMessage = await channel.messages.fetch(config.lastMessageId);
                                        if (oldMessage) {
                                            await oldMessage.delete().catch(() => {});
                                        }
                                    } catch (error) {
                                        console.error('Erreur lors de la suppression de l\'ancien message:', error);
                                        // Continue même si la suppression échoue
                                    }
                                }
                                
                                // Envoyer le nouveau message dans tous les cas
                                const initialMessage = await this.sendMessage(channel, config);
                                if (initialMessage) {
                                    this.lastMessages.set(channel.id, {
                                        id: initialMessage.id,
                                        timestamp: Date.now()
                                    });
                                    
                                    // Mettre à jour l'ID du dernier message dans la configuration
                                    if (messageId) {
                                        this.configManager.messageConfigs[messageId].lastMessageId = initialMessage.id;
                                    } else {
                                        this.configManager.messageConfigs[interaction.message.id].lastMessageId = initialMessage.id;
                                    }
                                    this.configManager.saveConfig();
                                }
                            }
                        } catch (error) {
                            console.error('Erreur lors de l\'envoi du message:', error);
                        }
                        
                        messageContent = {
                            content: messageId ? 'Configuration mise à jour !' : 'Configuration sauvegardée !',
                            embeds: [],
                            components: []
                        };
                        break;
    
                case 'cancel':
                    this.currentConfig.delete(interaction.user.id);
                    messageContent = {
                        content: 'Configuration annulée.',
                        embeds: [],
                        components: []
                    };
                    break;
    
                default:
                    messageContent = {
                        content: 'Action non reconnue.',
                        components: []
                    };
            }
    
            // Mettre à jour le message
            if (messageContent) {
                await interaction.message.edit(messageContent);
            }
    
        } catch (error) {
            console.error('Erreur critique:', error);
        }
    }
    
    async handleMessageInput(interaction, field, messageManager) {
        try {
            const fieldNames = {
                title: 'le titre',
                desc: 'la description',
                color: 'la couleur (format: #RRGGBB)',
                image: 'l\'URL de l\'image',
                footer: 'le footer'
            };
    
            const fieldName = fieldNames[field];
            if (!fieldName) return;
    
            // Modifier le message pour demander l'entrée
            await interaction.message.edit({
                content: `Veuillez entrer ${fieldName}:`,
                components: []
            });
    
            const filter = m => m.author.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessages({
                filter,
                max: 1,
                time: 30000,
                errors: ['time']
            });
    
            const message = collected.first();
            if (!message) {
                await interaction.message.edit({
                    content: 'Temps écoulé. Veuillez réessayer.',
                    components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig).components
                });
                return;
            }
    
            const config = this.currentConfig.get(interaction.user.id);
            if (!config) {
                await interaction.message.edit({
                    content: 'Configuration perdue. Veuillez recommencer.',
                    components: []
                });
                return;
            }
    
            // Mettre à jour la configuration
            switch (field) {
                case 'title': config.title = message.content; break;
                case 'desc': config.description = message.content; break;
                case 'color':
                    if (/^#[0-9A-F]{6}$/i.test(message.content)) {
                        config.color = message.content;
                    }
                    break;
                case 'image':
                    if (message.attachments.size > 0) {
                        config.image = message.attachments.first().url;
                    } else if (message.content.startsWith('http')) {
                        config.image = message.content;
                    }
                    break;
                case 'footer': config.footer = message.content; break;
            }
    
            this.currentConfig.set(interaction.user.id, config);
            await message.delete().catch(() => {});
    
            // Mettre à jour l'interface
            await interaction.message.edit(messageManager.createConfigMenu(interaction.user.id, this.currentConfig));
    
        } catch (error) {
            console.error('Erreur lors de la saisie:', error);
            if (interaction.message) {
                await interaction.message.edit({
                    content: 'Une erreur est survenue. Veuillez réessayer.',
                    components: messageManager.createConfigMenu(interaction.user.id, this.currentConfig).components
                });
            }
        }
    }
}

// Gestionnaire de l'interface utilisateur
class MessageUIManager {
    createConfigMenuRows(config) {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-channel')
                    .setLabel('Salon')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('msg-repeat')
                    .setLabel(`Répéter: ${config.repeat ? 'Activé' : 'Désactivé'}`)
                    .setStyle(config.repeat ? ButtonStyle.Success : ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('msg-type')
                    .setLabel(`Type: ${config.isEmbed ? 'Embed' : 'Message'}`)
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-title')
                    .setLabel('Titre')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!config.isEmbed),
                new ButtonBuilder()
                    .setCustomId('msg-desc')
                    .setLabel('Description/Message')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('msg-color')
                    .setLabel('Couleur')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!config.isEmbed)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-image')
                    .setLabel('Image')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!config.isEmbed),
                new ButtonBuilder()
                    .setCustomId('msg-footer')
                    .setLabel('Footer')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!config.isEmbed),
                new ButtonBuilder()
                    .setCustomId('msg-timestamp')
                    .setLabel(`Timestamp: ${config.timestamp ? 'Activé' : 'Désactivé'}`)
                    .setStyle(config.timestamp ? ButtonStyle.Success : ButtonStyle.Danger)
                    .setDisabled(!config.isEmbed)
            );

        const row4 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-save')
                    .setLabel('Sauvegarder')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('msg-cancel')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
            );

        return [row1, row2, row3, row4];
    }

    createMainMenu(messageConfigs, guild = null) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-add')
                    .setLabel('Ajouter un message')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('msg-modify')
                    .setLabel('Modifier un message')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(Object.keys(messageConfigs).length === 0),
                new ButtonBuilder()
                    .setCustomId('msg-delete')
                    .setLabel('Supprimer un message')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(Object.keys(messageConfigs).length === 0)
            );

        const embed = new EmbedBuilder()
            .setTitle('⚙️ | Configuration des Messages Automatiques')
            .setDescription('Choisissez une action à effectuer')
            .setColor(guild ? colorManager.getColor(guild.id) : '#0099ff');

        if (Object.keys(messageConfigs).length > 0) {
            embed.addFields({
                name: 'Messages actifs',
                value: Object.entries(messageConfigs)
                    .map(([id, cfg]) => `• 📝 #${cfg.channelName} ${cfg.repeat ? '(Répétition activée)' : ''}`)
                    .join('\n')
            });
        } else {
            embed.addFields({
                name: 'Messages actifs',
                value: 'Aucun message configuré'
            });
        }

        return {
            embeds: [embed],
            components: [row]
        };
    }

    createConfigMenu(userId, currentConfig, guild = null) {
        const config = currentConfig.get(userId) || {
            channelId: null,
            channelName: null,
            repeat: false,
            isEmbed: true,
            title: '',
            description: '',
            color: guild ? colorManager.getColor(guild.id) : '#0099ff',
            image: '',
            footer: '',
            timestamp: false
        };
    
        const rows = this.createConfigMenuRows(config);
    
        const embed = new EmbedBuilder()
            .setTitle('Configuration du Message')
            .setDescription('Configurez les paramètres du message')
            .setColor(guild ? colorManager.getColor(guild.id) : config.color)
            .addFields(
                { name: 'Salon', value: config.channelId ? `<#${config.channelId}>` : 'Non défini', inline: true },
                { name: 'Type', value: config.isEmbed ? 'Embed' : 'Message', inline: true },
                { name: 'Répétition', value: config.repeat ? 'Activée' : 'Désactivée', inline: true }
            );
    
        // Ajouter des champs selon le type (embed ou message)
        if (config.isEmbed) {
            // Champs spécifiques aux embeds
            embed.addFields(
                { name: 'Titre', value: config.title || 'Non défini', inline: true },
                { name: 'Description', value: config.description || 'Non défini', inline: true },
                { name: 'Couleur', value: config.color || '#0099ff', inline: true },
                { name: 'Image', value: config.image || 'Non définie', inline: true },
                { name: 'Footer', value: config.footer || 'Non défini', inline: true },
                { name: 'Timestamp', value: config.timestamp ? 'Activé' : 'Désactivé', inline: true }
            );
        } else {
            // Pour les messages simples, afficher uniquement la description
            embed.addFields(
                { name: 'Message', value: config.description || 'Non défini', inline: false }
            );
        }
    
        return {
            embeds: [embed],
            components: rows
        };
    }

    createChannelSelect(channels) {
        const options = channels.map(channel => ({
            label: channel.name,
            value: channel.id,
            description: `#${channel.name} (ID: ${channel.id})`,
            emoji: '📝'  // Ajouter une icône pour plus de clarté
        }));

        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('msg-channel-select')
                    .setPlaceholder('Sélectionnez le salon pour l\'auto-message')
                    .addOptions(options)
            );

        return {
            content: 'Sélectionnez le salon où l\'auto-message sera activé :',
            components: [row]
        };
    }

    createDeleteMenu(messageConfigs) {
        const options = Object.entries(messageConfigs).map(([id, cfg]) => ({
            label: `Message dans #${cfg.channelName}`,
            value: id,
            description: cfg.repeat ? 'Répétition activée' : 'Répétition désactivée',
            emoji: '🗑️'
        }));

        const row1 = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('msg-delete-select')
                    .setPlaceholder('Sélectionnez le message à supprimer')
                    .addOptions(options)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('msg-return')
                    .setLabel('Retour')
                    .setStyle(ButtonStyle.Secondary)
            );

        return {
            content: 'Sélectionnez le message à supprimer :',
            components: [row1, row2]
        };
    }
}

const autoMessageManager = new AutoMessageManager();

// Export du module
module.exports = {
    name: 'msg',
    
    async execute(message, args, client) {
        const messageUIManager = new MessageUIManager();
        
        const response = await message.channel.send(
            messageUIManager.createMainMenu(autoMessageManager.configManager.messageConfigs, message.guild)
        );
    
        // Définir le filtre pour le collector
        const filter = (interaction) => {
            return interaction.customId.startsWith('msg-') && interaction.user.id === message.author.id;
        };
    
        // Ajouter un Set pour suivre les interactions en cours de traitement
        const processingInteractions = new Set();
    
        // Créer le collector avec le filtre approprié
        const collector = response.createMessageComponentCollector({
            filter,
            time: 300000
        });
    
        collector.on('collect', async (interaction) => {
            // Si l'interaction est déjà en cours de traitement, l'ignorer
            if (processingInteractions.has(interaction.id)) return;
    
            processingInteractions.add(interaction.id);
    
            try {
                // Acquitter immédiatement l'interaction
                await interaction.deferUpdate().catch(console.error);
                await autoMessageManager.handleInteraction(interaction, messageUIManager);
            } catch (error) {
                console.error('Erreur dans le collector:', error);
                await interaction.followUp({
                    content: 'Une erreur est survenue lors du traitement de votre action.',
                    ephemeral: true
                }).catch(console.error);
            } finally {
                // Enlever l'interaction de la liste des traitements en cours
                processingInteractions.delete(interaction.id);
            }
        });
    
        collector.on('end', async (collected, reason) => {
            try {
                if (response.editable) {
                    await response.edit({
                        content: 'Session de configuration terminée.',
                        components: [],
                        embeds: []
                    }).catch(console.error);
                }
            } catch (error) {
                console.error('Erreur lors de la fin du collector:', error);
            }
        });
    },

    // Ajouter la méthode pour gérer les interactions directement
    async handleInteraction(interaction) {
        try {
            if (!interaction.customId.startsWith('msg-')) return;

            const messageUIManager = new MessageUIManager();
            await autoMessageManager.handleInteraction(interaction, messageUIManager);
        } catch (error) {
            console.error('Erreur dans handleInteraction:', error);
            await interaction.reply({
                content: 'Une erreur est survenue lors du traitement de votre action.',
                ephemeral: true
            }).catch(console.error);
        }
        return;
    },

    handleAutoMessage: (message) => {
        return autoMessageManager.handleAutoMessage(message);
    }
};