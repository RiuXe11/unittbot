const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

class ConfigHandler {
    constructor() {
        this.config = new Map();
        this.validConfigButtons = new Set([
            'toggle-system', 'set-category', 'set-hub', 
            'set-template', 'toggle-settings', 'send-config', 'cancel-config'
        ]);
        this.loadConfig();
    }

    saveConfig() {
        const configToSave = Object.fromEntries(this.config);
        const configPath = path.join(__dirname, '../../data/vocal/config.json');
        
        if (!fs.existsSync(path.dirname(configPath))) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    }

    loadConfig() {
        const configPath = path.join(__dirname, '../../data/vocal/config.json');
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            this.config.clear();
            Object.entries(data).forEach(([key, value]) => {
                this.config.set(key, value);
            });
        }
    }

    getConfig(guildId) {
        if (!this.config.has(guildId)) {
            this.config.set(guildId, {
                enabled: true,
                categoryId: null,
                hubName: "➕ Créer un salon",
                hubCategoryId: null,
                channelNameTemplate: "Salon de {MemberDisplayName}",
                showSettingsEmbed: true
            });
        }
        return this.config.get(guildId);
    }

    async createConfigEmbed(serverConfig) {
        return new EmbedBuilder()
            .setTitle('Configuration des salons vocaux')
            .setDescription('Utilisez les boutons ci-dessous pour configurer le système de salons vocaux.')
            .setColor('#0099ff')
            .addFields(
                { name: 'Système', value: serverConfig.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'Catégorie des salons temporaires', value: serverConfig.categoryId ? `ID: ${serverConfig.categoryId}` : 'Non configuré', inline: true },
                { name: 'Salon Hub', value: `Nom: ${serverConfig.hubName}\nCatégorie: ${serverConfig.hubCategoryId || 'Non configuré'}`, inline: true },
                { name: 'Template des noms de salon', value: serverConfig.channelNameTemplate, inline: true },
                { name: 'Embed de réglages', value: serverConfig.showSettingsEmbed ? '✅ Activé' : '❌ Désactivé', inline: true }
            );
    }

    createConfigButtons(serverConfig) {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('toggle-system')
                    .setLabel(serverConfig.enabled ? 'Désactiver' : 'Activer')
                    .setStyle(serverConfig.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('set-category')
                    .setLabel('Définir Catégorie')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('set-hub')
                    .setLabel('Configurer Hub')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('set-template')
                    .setLabel('Template des noms')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('toggle-settings')
                    .setLabel('Embed de réglages')
                    .setStyle(serverConfig.showSettingsEmbed ? ButtonStyle.Success : ButtonStyle.Danger)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('send-config')
                    .setLabel('Envoyer')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('cancel-config')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row1, row2, row3];
    }

    async updateConfigEmbed(interaction) {
        try {
            const serverConfig = this.getConfig(interaction.guildId);
            const embed = await this.createConfigEmbed(serverConfig);
            const components = this.createConfigButtons(serverConfig);

            if (interaction.message) {
                await interaction.message.edit({
                    embeds: [embed],
                    components: components
                });
            }
        } catch (error) {
            console.error('Erreur lors de la mise à jour de l\'embed:', error);
            throw error;
        }
    }

    async handleConfigInteraction(interaction) {
        if (!interaction.isButton()) return false;
        
        const configCommands = ['set-', 'toggle-', 'send-config', 'cancel-config'];
        if (!configCommands.some(cmd => interaction.customId.startsWith(cmd))) {
            return false;
        }

        try {
            await interaction.deferUpdate();
            
            if (!interaction.member.permissions.has('ManageChannels')) {
                await interaction.followUp({
                    content: "Vous n'avez pas la permission de gérer les salons.",
                    ephemeral: true
                });
                return true;
            }

            const serverConfig = this.getConfig(interaction.guildId);
            await this.handleConfigButton(interaction, serverConfig);
            return true;
        } catch (error) {
            console.error('Erreur dans handleConfigInteraction:', error);
            await interaction.followUp({
                content: 'Une erreur est survenue.',
                ephemeral: true
            });
            return true;
        }
    }

    async handleConfigButton(interaction, serverConfig) {
        try {
            switch (interaction.customId) {
                case 'toggle-system':
                    serverConfig.enabled = !serverConfig.enabled;
                    this.saveConfig();
                    await this.updateConfigEmbed(interaction);
                    await interaction.followUp({
                        content: `Système ${serverConfig.enabled ? 'activé' : 'désactivé'}`,
                        ephemeral: true
                    });
                    break;

                case 'toggle-settings':
                    serverConfig.showSettingsEmbed = !serverConfig.showSettingsEmbed;
                    this.saveConfig();
                    await this.updateConfigEmbed(interaction);
                    await interaction.followUp({
                        content: `Embed de réglages ${serverConfig.showSettingsEmbed ? 'activé' : 'désactivé'}`,
                        ephemeral: true
                    });
                    break;

                case 'set-hub':
                    await interaction.editReply({
                        content: 'Veuillez entrer le nom du salon Hub suivi de l\'ID de sa catégorie (exemple: "Créer un salon, 123456789") :'
                    });

                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        const message = collected.first();
                        const [name, categoryId] = message.content.split(',').map(s => s.trim());
                        const category = await interaction.guild.channels.fetch(categoryId);

                        if (!category || category.type !== 4) {
                            await interaction.followUp({
                                content: 'Catégorie invalide.',
                                ephemeral: true
                            });
                            return;
                        }

                        serverConfig.hubName = name;
                        serverConfig.hubCategoryId = categoryId;
                        await message.delete().catch(() => {});
                        this.saveConfig();
                        await this.updateConfigEmbed(interaction);
                        await interaction.followUp({
                            content: 'Configuration du Hub mise à jour !',
                            ephemeral: true
                        });
                    } catch (error) {
                        await interaction.followUp({
                            content: 'Format invalide ou temps écoulé.',
                            ephemeral: true
                        });
                    }
                    break;

                case 'set-category':
                    await interaction.editReply({
                        content: 'Veuillez entrer l\'ID de la catégorie :'
                    });

                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        const categoryId = collected.first().content;
                        const category = await interaction.guild.channels.fetch(categoryId);
                        
                        if (!category || category.type !== 4) {
                            throw new Error('Catégorie invalide');
                        }

                        serverConfig.categoryId = categoryId;
                        this.saveConfig();
                        await collected.first().delete().catch(() => {});
                        await this.updateConfigEmbed(interaction);
                        await interaction.followUp({
                            content: 'Catégorie mise à jour !',
                            ephemeral: true
                        });
                    } catch (error) {
                        await interaction.followUp({
                            content: 'ID de catégorie invalide ou temps écoulé.',
                            ephemeral: true
                        });
                    }
                    break;

                case 'set-template':
                    await interaction.editReply({
                        content: 'Veuillez entrer le template de nom ({MemberDisplayName} disponible) :'
                    });

                    try {
                        const templateCollected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });

                        serverConfig.channelNameTemplate = templateCollected.first().content;
                        this.saveConfig();
                        await templateCollected.first().delete().catch(() => {});
                        await this.updateConfigEmbed(interaction);
                        await interaction.followUp({
                            content: 'Template mis à jour !',
                            ephemeral: true
                        });
                    } catch (error) {
                        await interaction.followUp({
                            content: 'Temps écoulé.',
                            ephemeral: true
                        });
                    }
                    break;

                case 'send-config':
                    if (!serverConfig.categoryId || !serverConfig.hubCategoryId) {
                        await interaction.followUp({
                            content: 'Erreur : Vous devez configurer la catégorie et le hub avant de créer le salon.',
                            ephemeral: true
                        });
                        return;
                    }
                
                    try {
                        const hubChannel = await interaction.guild.channels.create({
                            name: serverConfig.hubName,
                            type: 2,
                            parent: serverConfig.hubCategoryId,
                            permissionOverwrites: [
                                {
                                    id: interaction.guild.id,
                                    allow: ['ViewChannel', 'Connect']
                                }
                            ]
                        });
                
                        if (interaction.message) {
                            await interaction.message.delete().catch(() => {});
                        }
                
                        await interaction.followUp({
                            content: `Le salon Hub a été créé avec succès ! (${hubChannel})`,
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Erreur lors de la création du salon hub:', error);
                        await interaction.followUp({
                            content: 'Une erreur est survenue lors de la création du salon hub.',
                            ephemeral: true
                        });
                    }
                    break;
                
                case 'cancel-config':
                    if (interaction.message) {
                        await interaction.message.delete().catch(() => {});
                    }
                    await interaction.followUp({
                        content: 'Configuration annulée.',
                        ephemeral: true
                    });
                    break;

                default:
                    console.log(`Commande de configuration inconnue: ${interaction.customId}`);
                    break;
            }
        } catch (error) {
            console.error('Erreur dans handleConfigButton:', error);
            throw error;
        }
    }

    // Méthode pour initialiser la configuration d'un serveur
    async sendConfigEmbed(message) {
        const serverConfig = this.getConfig(message.guildId);
        const embed = await this.createConfigEmbed(serverConfig);
        const components = this.createConfigButtons(serverConfig);
        
        return await message.channel.send({
            embeds: [embed],
            components: components
        });
    }
}

module.exports = new ConfigHandler();