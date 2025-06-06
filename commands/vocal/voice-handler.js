const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

class VoiceHandler {
    constructor() {
        this.voiceChannels = new Map();
    }

    createControlButtons(isOpen, isMuted = false, isDeafened = false) {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('voice-open')
                    .setLabel('Ouvert')
                    .setStyle(isOpen ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('voice-closed')
                    .setLabel('Fermé')
                    .setStyle(!isOpen ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('voice-whitelist')
                    .setLabel('Liste Blanche')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('voice-blacklist')
                    .setLabel('Liste Noire')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('voice-purge')
                    .setLabel('Purge')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('voice-mute')
                    .setLabel('Micro')
                    .setStyle(isMuted ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('voice-deafen')
                    .setLabel('Casque')
                    .setStyle(isDeafened ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('voice-soundboard')
                    .setLabel('Soundboard')
                    .setStyle(ButtonStyle.Secondary)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('voice-transfer')
                    .setLabel('Transférer la propriété')
                    .setStyle(ButtonStyle.Primary)
            );

        return [row1, row2, row3];
    }

    async handleVoiceInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return false;
        
        if (!interaction.customId.startsWith('voice-') && 
            !interaction.customId.endsWith('-manage') && 
            !interaction.customId.endsWith('-add') && 
            interaction.customId !== 'back-to-main') {
            return false;
        }

        try {
            const channelInfo = this.voiceChannels.get(interaction.channel.id);
            
            if (!channelInfo) {
                await interaction.reply({
                    content: "Ce salon n'est pas un salon vocal temporaire.",
                    ephemeral: true
                });
                return true;
            }

            if (interaction.user.id !== channelInfo.owner) {
                await interaction.reply({
                    content: "Vous n'êtes pas le propriétaire de ce salon.",
                    ephemeral: true
                });
                return true;
            }

            await interaction.deferUpdate();
            await this.executeVoiceCommand(interaction, interaction.channel, channelInfo);
            return true;

        } catch (error) {
            console.error('Erreur dans handleVoiceInteraction:', error);
            this.handleInteractionError(interaction, error);
            return true;
        }
    }

    async executeVoiceCommand(interaction, voiceChannel, channelInfo) {
        const commands = {
            'voice-open': () => this.handleVoiceOpen(interaction, voiceChannel, channelInfo),
            'voice-closed': () => this.handleVoiceClosed(interaction, voiceChannel, channelInfo),
            'voice-whitelist': () => this.showListManagementEmbed(interaction, voiceChannel, channelInfo, 'whitelist'),
            'voice-blacklist': () => this.showListManagementEmbed(interaction, voiceChannel, channelInfo, 'blacklist'),
            'voice-purge': () => this.handlePurge(interaction, voiceChannel, channelInfo),
            'voice-mute': () => this.handleMute(interaction, voiceChannel, channelInfo),
            'voice-deafen': () => this.handleDeafen(interaction, voiceChannel, channelInfo),
            'voice-soundboard': () => this.handleSoundboard(interaction, voiceChannel, channelInfo),
            'voice-transfer': () => this.handleTransfer(interaction, voiceChannel, channelInfo)
        };

        if (interaction.customId.endsWith('-manage') || interaction.customId.endsWith('-add')) {
            await this.handleListManagement(interaction, voiceChannel, channelInfo);
            return;
        }

        const command = commands[interaction.customId];
        if (command) {
            await command();
        }
    }

    async handleVoiceOpen(interaction, voiceChannel, channelInfo) {
        try {
            channelInfo.isOpen = true;
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                Connect: true,
                ViewChannel: true
            });
            await interaction.message.edit({
                components: this.createControlButtons(true, channelInfo.isMuted, channelInfo.isDeafened)
            });
            await interaction.followUp({
                content: 'Salon ouvert.',
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de l\'ouverture du salon:', error);
            throw error;
        }
    }

    async handleListManagement(interaction, voiceChannel, channelInfo) {
        try {
            // Déterminer le type de liste en fonction du customId
            const isWhitelist = interaction.customId === 'voice-whitelist';
            const listType = isWhitelist ? 'whitelist' : 'blacklist';
    
            // Créer l'embed pour la gestion de la liste
            const embed = new EmbedBuilder()
                .setTitle(`${isWhitelist ? 'Liste Blanche' : 'Liste Noire'}`)
                .setDescription(`Gérez les utilisateurs dans la ${isWhitelist ? 'liste blanche' : 'liste noire'}.`)
                .setColor(isWhitelist ? '#00FF00' : '#FF0000');
    
            // Récupérer les membres actuels de la liste
            const listMembers = await this.getListMembers(voiceChannel, channelInfo[listType]);
            if (listMembers.length > 0) {
                embed.addFields({
                    name: 'Utilisateurs',
                    value: listMembers.map(member => member.displayName).join('\n')
                });
            }
    
            // Créer les composants pour la gestion de la liste
            const components = [];
            
            // Ajouter le menu de sélection si des membres sont présents
            if (listMembers.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`${listType}-manage`)
                    .setPlaceholder('Sélectionnez un utilisateur à retirer')
                    .addOptions(
                        listMembers.map(member => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(member.displayName)
                                .setDescription(`Retirer ${member.displayName}`)
                                .setValue(`remove:${member.id}`)
                        )
                    );
                
                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }
    
            // Ajouter les boutons d'action
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${listType}-add`)
                        .setLabel('Ajouter un utilisateur')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('back-to-main')
                        .setLabel('Retour')
                        .setStyle(ButtonStyle.Secondary)
                );
    
            components.push(buttonRow);
    
            // Envoyer le message de gestion
            const response = await interaction.followUp({
                embeds: [embed],
                components: components,
                ephemeral: true
            });
    
            // Créer un collector pour gérer les interactions
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000 // 1 minute
            });
    
            // Gérer les interactions avec les boutons et menus
            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();
    
                    switch (i.customId) {
                        case 'back-to-main':
                            collector.stop('back');
                            await i.editReply({
                                content: 'Menu fermé.',
                                embeds: [],
                                components: []
                            });
                            break;
    
                        case `${listType}-add`:
                            await this.handleAddUser(i, voiceChannel, channelInfo, listType);
                            break;
    
                        case `${listType}-manage`:
                            if (i.values && i.values[0].startsWith('remove:')) {
                                const userId = i.values[0].split(':')[1];
                                await this.handleRemoveUser(i, voiceChannel, channelInfo, listType, userId);
                                
                                // Rafraîchir l'embed après la suppression
                                const updatedMembers = await this.getListMembers(voiceChannel, channelInfo[listType]);
                                const updatedEmbed = this.createUpdatedEmbed(isWhitelist, updatedMembers);
                                const updatedComponents = this.createUpdatedComponents(listType, updatedMembers);
                                
                                try {
                                    await i.editReply({
                                        embeds: [updatedEmbed],
                                        components: updatedComponents
                                    });
                                } catch (error) {
                                    console.error('Erreur lors de la mise à jour de l\'interface:', error);
                                }
                            }
                            break;
                    }
                } catch (error) {
                    console.error('Erreur lors du traitement de l\'interaction:', error);
                    await i.followUp({
                        content: 'Une erreur est survenue.',
                        ephemeral: true
                    }).catch(console.error);
                }
            });
    
            // Gérer la fin du collector
            collector.on('end', async (collected, reason) => {
                try {
                    if (reason !== 'back') {
                        try {
                            await response.fetch();
                            await response.edit({
                                content: 'Menu expiré',
                                components: [],
                                embeds: []
                            }).catch(() => {});
                        } catch {
                            console.log('Message déjà supprimé ou inaccessible');
                        }
                    }
                } catch (error) {
                    console.error('Erreur lors de la fermeture du menu:', error);
                }
            });
    
        } catch (error) {
            console.error('Erreur dans handleListManagement:', error);
            await interaction.followUp({
                content: 'Une erreur est survenue lors de la gestion de la liste.',
                ephemeral: true
            }).catch(console.error);
        }
    }

    createUpdatedEmbed(isWhitelist, members) {
        const embed = new EmbedBuilder()
            .setTitle(`${isWhitelist ? 'Liste Blanche' : 'Liste Noire'}`)
            .setDescription(`Gérez les utilisateurs dans la ${isWhitelist ? 'liste blanche' : 'liste noire'}.`)
            .setColor(isWhitelist ? '#00FF00' : '#FF0000');
    
        if (members.length > 0) {
            embed.addFields({
                name: 'Utilisateurs',
                value: members.map(member => member.displayName).join('\n')
            });
        }
    
        return embed;
    }
    
    createUpdatedComponents(listType, members) {
        const components = [];
    
        if (members.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`${listType}-manage`)
                .setPlaceholder('Sélectionnez un utilisateur à retirer')
                .addOptions(
                    members.map(member => 
                        new StringSelectMenuOptionBuilder()
                            .setLabel(member.displayName)
                            .setDescription(`Retirer ${member.displayName}`)
                            .setValue(`remove:${member.id}`)
                    )
                );
            
            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }
    
        const buttonRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`${listType}-add`)
                    .setLabel('Ajouter un utilisateur')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('back-to-main')
                    .setLabel('Retour')
                    .setStyle(ButtonStyle.Secondary)
            );
    
        components.push(buttonRow);
        return components;
    }

    async handleVoiceClosed(interaction, voiceChannel, channelInfo) {
        try {
            channelInfo.isOpen = false;
            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                Connect: false
            });
            await interaction.message.edit({
                components: this.createControlButtons(false, channelInfo.isMuted, channelInfo.isDeafened)
            });
            await interaction.followUp({
                content: 'Salon fermé.',
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de la fermeture du salon:', error);
            throw error;
        }
    }

    async handlePurge(interaction, voiceChannel, channelInfo) {
        try {
            const membersToKick = voiceChannel.members.filter(member => member.id !== channelInfo.owner);
            await Promise.all(membersToKick.map(member => member.voice.disconnect()));
            await interaction.followUp({
                content: 'Tous les membres ont été expulsés du salon.',
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de la purge du salon:', error);
            throw error;
        }
    }

    async handleMute(interaction, voiceChannel, channelInfo) {
        try {
            channelInfo.isMuted = !channelInfo.isMuted;
            const membersToMute = voiceChannel.members.filter(member => 
                member.id !== channelInfo.owner && !channelInfo.whitelist.has(member.id)
            );

            await Promise.all(membersToMute.map(member => 
                member.voice.setMute(channelInfo.isMuted)
            ));

            await interaction.message.edit({
                components: this.createControlButtons(channelInfo.isOpen, channelInfo.isMuted, channelInfo.isDeafened)
            });

            await interaction.followUp({
                content: `Les micros des membres (hors liste blanche) ont été ${channelInfo.isMuted ? 'désactivés' : 'activés'}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de la gestion du mute:', error);
            throw error;
        }
    }

    async handleDeafen(interaction, voiceChannel, channelInfo) {
        try {
            channelInfo.isDeafened = !channelInfo.isDeafened;
            const membersToDeafen = voiceChannel.members.filter(member => 
                member.id !== channelInfo.owner && !channelInfo.whitelist.has(member.id)
            );

            await Promise.all(membersToDeafen.map(member => 
                member.voice.setDeaf(channelInfo.isDeafened)
            ));

            await interaction.message.edit({
                components: this.createControlButtons(channelInfo.isOpen, channelInfo.isMuted, channelInfo.isDeafened)
            });

            await interaction.followUp({
                content: `Le casque des membres (hors liste blanche) a été ${channelInfo.isDeafened ? 'désactivé' : 'activé'}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de la gestion du deafen:', error);
            throw error;
        }
    }

    async handleSoundboard(interaction, voiceChannel, channelInfo) {
        try {
            const currentPerms = voiceChannel.permissionOverwrites.cache.get(interaction.guild.id);
            const isSoundboardAllowed = currentPerms?.allow.has('UseSoundboard');

            await voiceChannel.permissionOverwrites.edit(interaction.guild.id, {
                UseSoundboard: !isSoundboardAllowed
            });

            await interaction.followUp({
                content: `L'utilisation du soundboard est maintenant ${!isSoundboardAllowed ? 'autorisée' : 'interdite'}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors de la gestion du soundboard:', error);
            throw error;
        }
    }

    async handleTransfer(interaction, voiceChannel, channelInfo) {
        try {
            await interaction.followUp({
                content: 'Mentionnez l\'utilisateur à qui transférer la propriété du salon :',
                ephemeral: true
            });

            const collected = await interaction.channel.awaitMessages({
                filter: m => m.author.id === interaction.user.id,
                max: 1,
                time: 30000,
                errors: ['time']
            });

            const message = collected.first();
            if (!message) {
                await interaction.followUp({
                    content: 'Temps écoulé.',
                    ephemeral: true
                });
                return;
            }

            const newOwner = message.mentions.members.first();
            if (!newOwner) {
                await interaction.followUp({
                    content: 'Utilisateur invalide.',
                    ephemeral: true
                });
                return;
            }

            await this.transferOwnership(voiceChannel, channelInfo, newOwner);
            await message.delete().catch(() => {});
            
            await interaction.followUp({
                content: `La propriété du salon a été transférée à ${newOwner.displayName}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur lors du transfert de propriété:', error);
            throw error;
        }
    }

    async transferOwnership(voiceChannel, channelInfo, newOwner) {
        const oldOwnerId = channelInfo.owner;
        
        await voiceChannel.permissionOverwrites.edit(oldOwnerId, {
            Connect: true,
            ViewChannel: true,
            ManageChannels: false,
            MuteMembers: false,
            DeafenMembers: false
        });

        await voiceChannel.permissionOverwrites.edit(newOwner.id, {
            Connect: true,
            ViewChannel: true,
            ManageChannels: true,
            MuteMembers: true,
            DeafenMembers: true
        });

        channelInfo.owner = newOwner.id;
        channelInfo.whitelist.add(newOwner.id);
    }

    async showListManagementEmbed(interaction, voiceChannel, channelInfo, listType) {
        try {
            const isWhitelist = listType === 'whitelist';
            const embed = await this.createListManagementEmbed(voiceChannel, channelInfo, listType);
            const components = await this.createListManagementComponents(channelInfo[listType], listType, voiceChannel);

            const response = await interaction.followUp({
                embeds: [embed],
                components: components,
                ephemeral: true
            });

            // Créer un collector avec une portée limitée au message de réponse
            const collector = response.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            });

            collector.on('collect', async (i) => {
                try {
                    await i.deferUpdate();

                    if (i.customId === 'back-to-main') {
                        collector.stop();
                        await i.editReply({
                            content: 'Menu fermé.',
                            components: [],
                            embeds: []
                        });
                        return;
                    }

                    if (i.customId === `${listType}-add`) {
                        await this.handleAddUser(i, voiceChannel, channelInfo, listType);
                        return;
                    }

                    if (i.customId === `${listType}-manage`) {
                        await this.handleRemoveUser(i, voiceChannel, channelInfo, listType);
                    }
                } catch (error) {
                    console.error('Erreur dans le collector:', error);
                    await i.followUp({
                        content: 'Une erreur est survenue.',
                        ephemeral: true
                    }).catch(console.error);
                }
            });

            collector.on('end', async () => {
                try {
                    try {
                        await response.fetch();
                        await response.edit({
                            components: [],
                            content: 'Menu expiré'
                        }).catch(() => {}); 
                    } catch {
                        console.log('Message déjà supprimé');
                    }
                } catch (error) {
                    console.error('Erreur lors de la fermeture du collector:', error);
                }
            });
        } catch (error) {
            console.error('Erreur dans showListManagementEmbed:', error);
            throw error;
        }
    }

    async createListManagementEmbed(voiceChannel, channelInfo, listType) {
        const isWhitelist = listType === 'whitelist';
        const listMembers = await this.getListMembers(voiceChannel, channelInfo[listType]);

        const embed = new EmbedBuilder()
            .setTitle(`${isWhitelist ? 'Liste Blanche' : 'Liste Noire'}`)
            .setDescription(`Gérez les utilisateurs dans la ${isWhitelist ? 'liste blanche' : 'liste noire'}.`)
            .setColor(isWhitelist ? '#00FF00' : '#FF0000');

        if (listMembers.length > 0) {
            embed.addFields({
                name: 'Utilisateurs',
                value: listMembers.map(member => member.displayName).join('\n')
            });
        }

        return embed;
    }

    async createListManagementComponents(list, listType, voiceChannel) {
        const components = [];
        
        if (list.size > 0) {
            const members = await this.getListMembers(voiceChannel, list);

            if (members.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`${listType}-manage`)
                    .setPlaceholder('Sélectionnez un utilisateur à retirer')
                    .addOptions(
                        members.map(member => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(member.displayName)
                                .setDescription(`Retirer ${member.displayName}`)
                                .setValue(`remove:${member.id}`)
                        )
                    );
                
                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }
        }

        const addButton = new ButtonBuilder()
            .setCustomId(`${listType}-add`)
            .setLabel('Ajouter un utilisateur')
            .setStyle(ButtonStyle.Success);

        const backButton = new ButtonBuilder()
            .setCustomId('back-to-main')
            .setLabel('Retour')
            .setStyle(ButtonStyle.Secondary);

        components.push(new ActionRowBuilder().addComponents(addButton, backButton));

        return components;
    }

    async handleAddUser(interaction, voiceChannel, channelInfo, listType) {
        const isWhitelist = listType === 'whitelist';
        
        await interaction.followUp({
            content: `Mentionnez l'utilisateur à ajouter à la ${isWhitelist ? 'liste blanche' : 'liste noire'} :`,
            ephemeral: true
        });

        try {
            const collected = await interaction.channel.awaitMessages({
                filter: m => m.author.id === interaction.user.id && m.mentions.members.size > 0,
                max: 1,
                time: 30000
            });

            const message = collected.first();
            if (!message) {
                await interaction.followUp({
                    content: 'Temps écoulé.',
                    ephemeral: true
                });
                return;
            }

            const user = message.mentions.members.first();
            if (!user) return;

            await message.delete().catch(() => {});
            await this.addUserToList(user, voiceChannel, channelInfo, listType);
            
            await interaction.followUp({
                content: `${user.displayName} a été ajouté à la ${isWhitelist ? 'liste blanche' : 'liste noire'}.`,
                ephemeral: true
            });

            // Rafraîchir l'embed
            await this.showListManagementEmbed(interaction, voiceChannel, channelInfo, listType);
        } catch (error) {
            console.error('Erreur dans handleAddUser:', error);
            throw error;
        }
    }

    async handleRemoveUser(interaction, voiceChannel, channelInfo, listType) {
        try {
            const [action, userId] = interaction.values[0].split(':');
            if (action !== 'remove') return;

            await this.removeUserFromList(userId, voiceChannel, channelInfo, listType);
            
            // Mettre à jour l'interface
            const embed = await this.createListManagementEmbed(voiceChannel, channelInfo, listType);
            const components = await this.createListManagementComponents(channelInfo[listType], listType, voiceChannel);

            await interaction.editReply({
                embeds: [embed],
                components: components
            });

            await interaction.followUp({
                content: `Utilisateur retiré de la ${listType === 'whitelist' ? 'liste blanche' : 'liste noire'}.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Erreur dans handleRemoveUser:', error);
            throw error;
        }
    }

    async addUserToList(user, voiceChannel, channelInfo, listType) {
        channelInfo[listType].add(user.id);

        if (listType === 'blacklist') {
            await voiceChannel.permissionOverwrites.edit(user.id, {
                Connect: false,
                ViewChannel: true
            });
        } else if (!channelInfo.isOpen) {
            await voiceChannel.permissionOverwrites.edit(user.id, {
                Connect: true,
                ViewChannel: true
            });
        }
    }

    async removeUserFromList(userId, voiceChannel, channelInfo, listType) {
        channelInfo[listType].delete(userId);

        if (listType === 'whitelist' && !channelInfo.isOpen) {
            await voiceChannel.permissionOverwrites.edit(userId, {
                Connect: false
            });
        } else if (listType === 'blacklist') {
            await voiceChannel.permissionOverwrites.edit(userId, {
                Connect: channelInfo.isOpen,
                ViewChannel: true
            });
        }
    }

    async getListMembers(voiceChannel, list) {
        return await Promise.all(
            Array.from(list).map(async (userId) => {
                try {
                    return await voiceChannel.guild.members.fetch(userId);
                } catch {
                    return null;
                }
            })
        ).then(members => members.filter(member => member !== null));
    }

    async handleInteractionError(interaction, error) {
        console.error('Erreur détaillée:', error);
    
        try {
            const errorMessage = {
                content: 'Une erreur est survenue lors du traitement de votre demande.',
                ephemeral: true
            };
    
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(errorMessage).catch(console.error);
            } else {
                await interaction.followUp(errorMessage).catch(console.error);
            }
        } catch (e) {
            console.error('Erreur lors de la gestion d\'erreur:', e);
        }
    }
}

module.exports = new VoiceHandler();
