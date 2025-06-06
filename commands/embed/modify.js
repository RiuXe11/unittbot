const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

module.exports = {
    name: 'embed-modify',
    description: 'Modifie un embed existant créé par le bot.',
    async execute(message, args, client) {
        let targetChannel = null;
        let messageId = null;
        let currentEmbed = null;
        let tempEmbed = null;
        let embedMessage = null;

        const serverColor = colorManager.getColor(message.guild.id);

        const modifyEmbed = new EmbedBuilder()
            .setTitle('Modifier un Embed')
            .setDescription('> Utilisez les boutons ci-dessous pour spécifier le *salon* et *l\'ID du message* à modifier.')
            .addFields(
                { name: '📝 | Salon', value: 'Aucun salon sélectionné.', inline: true },
                { name: '🆔 | ID du message', value: 'Aucun ID de message spécifié.', inline: true }
            )
            .setColor(serverColor);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('modify_channel').setLabel('📝 | Sélectionnez le salon').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('modify_message_id').setLabel('🗒️ | Sélectionnez l\'ID du message').setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('search_embed').setLabel('Chercher').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger)
        );

        const modifyMessage = await message.channel.send({ embeds: [modifyEmbed], components: [row1, row2] });

        const collector = modifyMessage.createMessageComponentCollector();

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: "Vous n'avez pas la permission d'utiliser ces boutons.", ephemeral: true });
            }

            if (i.customId === 'modify_channel') {
                await i.deferReply({ ephemeral: true });
                await i.editReply({ content: 'Veuillez mentionner le salon.' });
                const filter = response => response.mentions.channels.size > 0 && response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });

                if (collected.size > 0) {
                    targetChannel = collected.first().mentions.channels.first();
                    modifyEmbed.spliceFields(0, 1, { name: 'Salon', value: `${targetChannel}`, inline: true });
                    await modifyMessage.edit({ embeds: [modifyEmbed], components: [row1, row2] });
                    await i.editReply({ content: 'Le salon a été mis à jour.' });
                }
            }

            if (i.customId === 'modify_message_id') {
                await i.deferReply({ ephemeral: true });
                await i.editReply({ content: 'Veuillez entrer l\'ID du message.' });
                const filter = response => response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });

                if (collected.size > 0) {
                    messageId = collected.first().content;
                    modifyEmbed.spliceFields(1, 1, { name: 'ID du message', value: `\`${messageId}\``, inline: true });
                    await modifyMessage.edit({ embeds: [modifyEmbed], components: [row1, row2] });
                    await i.editReply({ content: 'L\'ID du message a été mis à jour.' });
                }
            }

            if (i.customId === 'search_embed') {
                await i.deferReply({ ephemeral: true });

                if (!targetChannel || !messageId) {
                    return i.editReply({ content: 'Veuillez spécifier à la fois le salon et l\'ID du message.' });
                }

                try {
                    embedMessage = await targetChannel.messages.fetch(messageId);
                    if (!embedMessage) {
                        return i.editReply({ content: 'Le message spécifié n\'existe pas ou a été supprimé.' });
                    }

                    if (embedMessage.embeds.length === 0) {
                        return i.editReply({ content: 'Aucun embed trouvé dans ce message.' });
                    }

                    currentEmbed = EmbedBuilder.from(embedMessage.embeds[0]);
                    tempEmbed = new EmbedBuilder(currentEmbed);
                    //
                    const row3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('modify_title').setLabel('Modifier le titre').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('modify_description').setLabel('Modifier la description').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('modify_color').setLabel('Modifier la couleur').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('modify_author').setLabel('Ajouter/Modifier un auteur').setStyle(ButtonStyle.Primary)
                    );
                    
                    const row4 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('add_field').setLabel('Ajouter un field').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('toggle_timestamp').setLabel('Ajouter/Supprimer un timestamp').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('modify_footer').setLabel('Ajouter/Modifier un footer').setStyle(ButtonStyle.Secondary)
                    );
                    
                    const row5 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('send_embed').setLabel('Mettre à jour').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('cancel_embed').setLabel('Annuler').setStyle(ButtonStyle.Danger)
                    );

                    const editMessage = await message.channel.send({ embeds: [tempEmbed], components: [row3, row4, row5] });

                    const editCollector = editMessage.createMessageComponentCollector();

                    editCollector.on('collect', async buttonInteraction => {
                        if (buttonInteraction.customId !== 'cancel_embed') {
                            await buttonInteraction.deferReply({ ephemeral: true });
                        }

                        if (buttonInteraction.customId === 'modify_title') {
                            await buttonInteraction.editReply({ content: 'Veuillez entrer le nouveau titre pour l\'embed.' });
                            const filter = response => response.author.id === message.author.id;
                            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collected.size > 0) {
                                const newTitle = collected.first().content;
                                tempEmbed.setTitle(newTitle);
                                await editMessage.edit({ embeds: [tempEmbed] });
                                await buttonInteraction.editReply({ content: 'Le titre de l\'embed a été modifié.' });
                            }
                        }

                        if (buttonInteraction.customId === 'modify_description') {
                            await buttonInteraction.editReply({ content: 'Veuillez entrer la nouvelle description pour l\'embed.' });
                            const filter = response => response.author.id === message.author.id;
                            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collected.size > 0) {
                                const newDescription = collected.first().content;
                                tempEmbed.setDescription(newDescription);
                                await editMessage.edit({ embeds: [tempEmbed] });
                                await buttonInteraction.editReply({ content: 'La description de l\'embed a été modifiée.' });
                            }
                        }

                        if (buttonInteraction.customId === 'modify_color') {
                            await buttonInteraction.followUp({ content: 'Veuillez entrer un code couleur en hexadécimal (par exemple : #FF5733).', ephemeral: true });
                            const filter = response => response.author.id === message.author.id;
                            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collected.size > 0) {
                                const newColor = collected.first().content;
                                if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                                    tempEmbed.setColor(newColor);
                                    await editMessage.edit({ embeds: [tempEmbed] });
                                    await buttonInteraction.followUp({ content: 'La couleur de l\'embed a été modifiée.', ephemeral: true });
                                } else {
                                    await buttonInteraction.followUp({ content: 'Le code couleur est invalide.', ephemeral: true });
                                }
                            }
                        }

                        if (buttonInteraction.customId === 'modify_author') {
                            await buttonInteraction.followUp({ content: 'Veuillez entrer le nom de l\'auteur.', ephemeral: true });
                            const filter = response => response.author.id === message.author.id;
                        
                            // Collecte le nom de l'auteur
                            const collectedName = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collectedName.size > 0) {
                                const authorName = collectedName.first().content;
                        
                                // Demande à l'utilisateur s'il veut ajouter une image
                                await buttonInteraction.followUp({ content: 'Veuillez entrer l\'URL de l\'image de l\'auteur ou envoyer une image en pièce jointe.', ephemeral: true });
                                const collectedImage = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                        
                                if (collectedImage.size > 0) {
                                    const imageResponse = collectedImage.first();
                        
                                    let authorIconURL = null;
                        
                                    // Vérifie s'il y a une pièce jointe
                                    if (imageResponse.attachments.size > 0) {
                                        const attachment = imageResponse.attachments.first();
                        
                                        // Vérifie si la pièce jointe est une image
                                        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                                            authorIconURL = attachment.url;
                                        } else {
                                            await buttonInteraction.followUp({ content: 'Le fichier envoyé n\'est pas une image valide. L\'auteur sera ajouté sans image.', ephemeral: true });
                                        }
                                    } else {
                                        // Sinon, vérifie si le message est une URL et s'il pointe vers une image
                                        const potentialURL = imageResponse.content;
                                        if (/^https?:\/\/[^\s$.?#].[^\s]*$/gm.test(potentialURL) && /\.(jpeg|jpg|gif|png)$/i.test(potentialURL)) {
                                            authorIconURL = potentialURL;
                                        } else {
                                            await buttonInteraction.followUp({ content: 'L\'URL fournie n\'est pas une image valide. L\'auteur sera ajouté sans image.', ephemeral: true });
                                        }
                                    }
                        
                                    // Ajoute l'auteur à l'embed avec ou sans image
                                    if (authorIconURL) {
                                        tempEmbed.setAuthor({ name: authorName, iconURL: authorIconURL });
                                        await editMessage.edit({ embeds: [tempEmbed] });
                                        await buttonInteraction.followUp({ content: 'L\'auteur de l\'embed a été modifié avec une image.', ephemeral: true });
                                    } else {
                                        tempEmbed.setAuthor({ name: authorName });
                                        await editMessage.edit({ embeds: [tempEmbed] });                                       
                                        await buttonInteraction.followUp({ content: 'L\'auteur de l\'embed a été modifié sans image.', ephemeral: true });
                                    }
                                }
                            }
                        }

                        if (buttonInteraction.customId === 'add_field') {
                            await buttonInteraction.followUp({ content: 'Veuillez entrer le titre du field.', ephemeral: true });
                            const filter = response => response.author.id === message.author.id;
                        
                            // Collecter le titre du field
                            const collectedTitle = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collectedTitle.size > 0) {
                                const fieldTitle = collectedTitle.first().content;
                        
                                // Demander maintenant la description du field
                                await buttonInteraction.followUp({ content: 'Veuillez entrer la description du field.', ephemeral: true });
                                const collectedDescription = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                                
                                if (collectedDescription.size > 0) {
                                    const fieldValue = collectedDescription.first().content;
                                    tempEmbed.addFields({ name: fieldTitle, value: fieldValue, inline: true });
                                    await editMessage.edit({ embeds: [tempEmbed] });
                                    await buttonInteraction.followUp({ content: 'Le field a été ajouté.', ephemeral: true });
                                } else {
                                    await buttonInteraction.followUp({ content: 'La description du field n\'a pas été fournie à temps.', ephemeral: true });
                                }
                            } else {
                                await buttonInteraction.followUp({ content: 'Le titre du field n\'a pas été fourni à temps.', ephemeral: true });
                            }
                        }
                        
                        if (buttonInteraction.customId === 'toggle_timestamp') {
                            if (tempEmbed.timestamp) {
                                tempEmbed.setTimestamp(null);
                            } else {
                                tempEmbed.setTimestamp(new Date());
                            }
                            await editMessage.edit({ embeds: [tempEmbed] });
                            await buttonInteraction.followUp({ content: 'Timestamp modifié.', ephemeral: true });
                        }
            
                        if (buttonInteraction.customId === 'modify_footer') {
                            await buttonInteraction.followUp({ content: 'Veuillez entrer le texte du footer.', ephemeral: true });
                            const filter = response => response.author.id === message.author.id;
                            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                            if (collected.size > 0) {
                                const footerText = collected.first().content;
                                tempEmbed.setFooter({ text: footerText });
                                await editMessage.edit({ embeds: [tempEmbed] });
                                await buttonInteraction.followUp({ content: 'Le texte du footer a été modifié.', ephemeral: true });
                            }
                        }

                        if (buttonInteraction.customId === 'send_embed') {
                            try {
                                currentEmbed = new EmbedBuilder(tempEmbed);
                                await embedMessage.edit({ embeds: [currentEmbed] });
                                await buttonInteraction.editReply({ content: 'L\'embed a été mis à jour avec succès.' });
                            } catch (error) {
                                console.error('Erreur lors de la mise à jour de l\'embed:', error);
                                buttonInteraction.editReply({ content: 'Erreur lors de la mise à jour de l\'embed.' });
                            }
                        }

                        if (buttonInteraction.customId === 'cancel_embed') {
                            await buttonInteraction.update({ content: 'Annulation... \nMerci de patienter \`5 secondes\`.', components: [] });
                            setTimeout(() => {
                                editMessage.delete();
                            }, 5000);
                        }
                    });

                    await i.editReply({ content: 'L\'embed a été trouvé et les options de modification sont affichées.' });
                } catch (error) {
                    console.error('Erreur lors de la récupération du message:', error);
                    return i.editReply({ content: 'Erreur lors de la récupération du message. Vérifiez l\'ID et le salon.' });
                }
            }

            if (i.customId === 'cancel') {
                await i.update({ content: 'Annulation... \nMerci de patienter \`5 secondes\`.', components: [] });
                setTimeout(() => {
                    modifyMessage.delete();
                }, 5000);
            }
        });
    }
};
