const ConfigHandler = require('./vocal-config.js');
const VoiceHandler = require('./voice-handler.js');

const { EmbedBuilder } = require('discord.js');

class VocalManager {
    constructor() {
        this.voiceHandler = VoiceHandler;
        this.configHandler = ConfigHandler;
    }

    // Commande principale
    async execute(message, args) {
        if (!message.member.permissions.has('ManageChannels')) {
            await message.reply("Vous n'avez pas la permission de gérer les salons vocaux.");
            return;
        }

        try {
            await this.configHandler.sendConfigEmbed(message);
        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande vocal:', error);
            await message.reply('Une erreur est survenue lors de la configuration des salons vocaux.');
        }
    }

    // Gestion des interactions
    async handleInteraction(interaction) {
        try {
            console.log("Interaction reçue:", interaction.customId);

            // D'abord essayer le gestionnaire de configuration
            const configHandled = await this.configHandler.handleConfigInteraction(interaction);
            if (configHandled) return true;

            // Ensuite essayer le gestionnaire vocal
            const voiceHandled = await this.voiceHandler.handleVoiceInteraction(interaction);
            if (voiceHandled) return true;

            return false;
        } catch (error) {
            console.error('Erreur dans handleInteraction:', error);
            await this.handleInteractionError(interaction, error);
            return true;
        }
    }

    // Gestion des événements vocaux
    async handleVoiceStateUpdate(oldState, newState, client) {
        try {
            if (!newState?.guild?.id) return;

            const serverConfig = this.configHandler.getConfig(newState.guild.id);
            if (!serverConfig || !serverConfig.enabled) return;

            // Gérer les mouvements entre salons
            if (oldState?.channel?.id === newState?.channel?.id) return;

            // Gestion de la création de salon
            if (newState?.channel?.name === serverConfig.hubName) {
                await this.createVoiceChannel(newState, serverConfig);
            }

            // Gestion du nettoyage des salons vides
            if (oldState?.channel) {
                await this.cleanupEmptyChannel(oldState.channel, client);
            }
        } catch (error) {
            console.error('Erreur dans handleVoiceStateUpdate:', error);
        }
    }

    // Création d'un nouveau salon vocal
    async createVoiceChannel(newState, serverConfig) {
        try {
            const newChannel = await newState.guild.channels.create({
                name: this.formatChannelName(serverConfig.channelNameTemplate, newState.member),
                type: 2,
                parent: serverConfig.categoryId,
                permissionOverwrites: [
                    {
                        id: newState.guild.id,
                        allow: ['ViewChannel', 'Connect']
                    },
                    {
                        id: newState.member.id,
                        allow: ['ViewChannel', 'Connect', 'ManageChannels', 'MuteMembers', 'DeafenMembers']
                    }
                ]
            });

            const channelInfo = {
                owner: newState.member.id,
                whitelist: new Set([newState.member.id]),
                blacklist: new Set(),
                isOpen: true,
                isMuted: false,
                isDeafened: false
            };

            this.voiceHandler.voiceChannels.set(newChannel.id, channelInfo);
            await newState.setChannel(newChannel);

            if (serverConfig.showSettingsEmbed) {
                await this.sendControlEmbed(newChannel);
            }
        } catch (error) {
            console.error('Erreur lors de la création du salon:', error);
            throw error;
        }
    }

    // Nettoyage des salons vides
    async cleanupEmptyChannel(channel, client) {
        try {
            if (!this.voiceHandler.voiceChannels.has(channel.id)) return;

            const channelMembers = channel.members;
            const botId = client?.user?.id;

            if (!channelMembers || 
                channelMembers.size === 0 || 
                (botId && channelMembers.size === 1 && channelMembers.first()?.id === botId)) {
                
                this.voiceHandler.voiceChannels.delete(channel.id);
                await channel.delete().catch(err => {
                    console.error('Erreur lors de la suppression du salon:', err);
                });
            }
        } catch (error) {
            console.error('Erreur lors du nettoyage du salon:', error);
        }
    }

    // Envoi de l'embed de contrôle
    async sendControlEmbed(channel) {
        const controlEmbed = new EmbedBuilder()
            .setTitle('Contrôles du salon vocal')
            .setDescription('Utilisez les boutons ci-dessous pour gérer votre salon vocal.')
            .setColor('#0099ff');
        
        await channel.send({
            embeds: [controlEmbed],
            components: this.voiceHandler.createControlButtons(true)
        });
    }

    // Formatage du nom du salon
    formatChannelName(template, member) {
        return template.replace('{MemberDisplayName}', member.displayName);
    }

    // Gestion des erreurs d'interaction
    async handleInteractionError(interaction, error) {
        console.error('Erreur détaillée:', error);
        console.error('Stack trace:', error.stack);

        try {
            const errorMessage = {
                content: 'Une erreur est survenue lors du traitement de votre demande.',
                ephemeral: true
            };

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(errorMessage);
            } else {
                await interaction.followUp(errorMessage);
            }
        } catch (replyError) {
            console.error('Erreur lors de la réponse d\'erreur:', replyError);
        }
    }

    // Getters pour l'accès aux données
    get voiceChannels() {
        return this.voiceHandler.voiceChannels;
    }

    get config() {
        return this.configHandler.config;
    }
}

// Exporter une instance unique
const vocalManager = new VocalManager();

module.exports = {
    name: 'vocal',
    description: 'Configure et gère le système de salons vocaux',
    
    execute: (message, args) => vocalManager.execute(message, args),
    handleInteraction: (interaction) => vocalManager.handleInteraction(interaction),
    handleVoiceStateUpdate: (oldState, newState, client) => 
        vocalManager.handleVoiceStateUpdate(oldState, newState, client),
    
    // Export des maps pour la compatibilité
    get voiceChannels() {
        return vocalManager.voiceChannels;
    },
    get config() {
        return vocalManager.config;
    }
};