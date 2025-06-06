const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

module.exports = {
    name: 'embed',
    description: 'Créer, modifier ou supprimer un embed.',
    async execute(message, args, client) {
        const serverColor = colorManager.getColor(message.guild.id);
        const embed = new EmbedBuilder().setTitle('Titre par défaut').setDescription('Description par défaut').setColor(serverColor);
        
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('modify_title').setLabel('Modifier le titre').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('modify_description').setLabel('Modifier la description').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('modify_color').setLabel('Modifier la couleur').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('modify_author').setLabel('Ajouter/Modifier un auteur').setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('add_field').setLabel('Ajouter un field').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('toggle_timestamp').setLabel('Ajouter/Supprimer un timestamp').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('modify_footer').setLabel('Ajouter/Modifier un footer').setStyle(ButtonStyle.Secondary)
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('send_embed').setLabel('Envoyer').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger)
        );

        const embedMessage = await message.channel.send({ embeds: [embed], components: [row1, row2, row3] });

        // Fonction pour sauvegarder l'embed dans un fichier JSON
        const saveEmbedToFile = (embedData) => {
            const dirPath = path.join(__dirname, '../../data/embed');
            const filePath = path.join(dirPath, 'embeds.json');
        
            // Vérifie si le répertoire existe, sinon le crée
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        
            // Initialise le tableau pour stocker les embeds
            let existingEmbeds = [];
        
            // Lit les données existantes du fichier, si possible
            if (fs.existsSync(filePath)) {
                try {
                    const rawData = fs.readFileSync(filePath, 'utf-8');
                    existingEmbeds = JSON.parse(rawData);
        
                    // Vérifie si le contenu du fichier est un tableau
                    if (!Array.isArray(existingEmbeds)) {
                        existingEmbeds = [];
                    }
                } catch (error) {
                    console.error('Erreur lors de la lecture du fichier JSON:', error);
                    existingEmbeds = [];
                }
            }
        
            // Ajoute le nouvel embed aux données existantes
            existingEmbeds.push(embedData);
        
            // Écrit les nouvelles données dans le fichier
            fs.writeFileSync(filePath, JSON.stringify(existingEmbeds, null, 4));
        };

        const collector = embedMessage.createMessageComponentCollector();

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: "Vous n'avez pas la permission d'utiliser ces boutons.", ephemeral: true });
            }

            if (i.customId === 'modify_title') {
                await i.reply({ content: 'Veuillez entrer le nouveau titre pour l\'embed.', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collected.size > 0) {
                    const newTitle = collected.first().content;
                    embed.setTitle(newTitle);
                    await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                    await i.followUp({ content: 'Le titre de l\'embed a été modifié.', ephemeral: true });
                }
            }

            if (i.customId === 'modify_description') {
                await i.reply({ content: 'Veuillez entrer la nouvelle description pour l\'embed.', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collected.size > 0) {
                    const newDescription = collected.first().content;
                    embed.setDescription(newDescription);
                    await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                    await i.followUp({ content: 'La description de l\'embed a été modifiée.', ephemeral: true });
                }
            }

            if (i.customId === 'modify_color') {
                await i.reply({ content: 'Veuillez entrer un code couleur en hexadécimal (par exemple : #FF5733).', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collected.size > 0) {
                    const newColor = collected.first().content;
                    if (/^#[0-9A-F]{6}$/i.test(newColor)) {
                        embed.setColor(newColor);
                        await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                        await i.followUp({ content: 'La couleur de l\'embed a été modifiée.', ephemeral: true });
                    } else {
                        await i.followUp({ content: 'Le code couleur est invalide.', ephemeral: true });
                    }
                }
            }

            if (i.customId === 'modify_author') {
                await i.reply({ content: 'Veuillez entrer le nom de l\'auteur.', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
            
                // Collecte le nom de l'auteur
                const collectedName = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collectedName.size > 0) {
                    const authorName = collectedName.first().content;
            
                    // Demande à l'utilisateur s'il veut ajouter une image
                    await i.followUp({ content: 'Veuillez entrer l\'URL de l\'image de l\'auteur ou envoyer une image en pièce jointe.', ephemeral: true });
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
                                await i.followUp({ content: 'Le fichier envoyé n\'est pas une image valide. L\'auteur sera ajouté sans image.', ephemeral: true });
                            }
                        } else {
                            // Sinon, vérifie si le message est une URL et s'il pointe vers une image
                            const potentialURL = imageResponse.content;
                            if (/^https?:\/\/[^\s$.?#].[^\s]*$/gm.test(potentialURL) && /\.(jpeg|jpg|gif|png)$/i.test(potentialURL)) {
                                authorIconURL = potentialURL;
                            } else {
                                await i.followUp({ content: 'L\'URL fournie n\'est pas une image valide. L\'auteur sera ajouté sans image.', ephemeral: true });
                            }
                        }
            
                        // Ajoute l'auteur à l'embed avec ou sans image
                        if (authorIconURL) {
                            embed.setAuthor({ name: authorName, iconURL: authorIconURL });
                            await i.followUp({ content: 'L\'auteur de l\'embed a été modifié avec une image.', ephemeral: true });
                        } else {
                            embed.setAuthor({ name: authorName });
                            await i.followUp({ content: 'L\'auteur de l\'embed a été modifié sans image.', ephemeral: true });
                        }
            
                        await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                    }
                }
            }                      

            if (i.customId === 'add_field') {
                await i.reply({ content: 'Veuillez entrer le titre du field.', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
            
                // Collecter le titre du field
                const collectedTitle = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collectedTitle.size > 0) {
                    const fieldTitle = collectedTitle.first().content;
            
                    // Demander maintenant la description du field
                    await i.followUp({ content: 'Veuillez entrer la description du field.', ephemeral: true });
                    const collectedDescription = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                    
                    if (collectedDescription.size > 0) {
                        const fieldValue = collectedDescription.first().content;
                        embed.addFields({ name: fieldTitle, value: fieldValue, inline: true });
                        await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                        await i.followUp({ content: 'Le field a été ajouté.', ephemeral: true });
                    } else {
                        await i.followUp({ content: 'La description du field n\'a pas été fournie à temps.', ephemeral: true });
                    }
                } else {
                    await i.reply({ content: 'Le titre du field n\'a pas été fourni à temps.', ephemeral: true });
                }
            }

            if (i.customId === 'toggle_timestamp') {
                if (embed.timestamp) {
                    embed.setTimestamp(null);
                } else {
                    embed.setTimestamp(new Date());
                }
                await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                await i.reply({ content: 'Timestamp modifié.', ephemeral: true });
            }

            if (i.customId === 'modify_footer') {
                await i.reply({ content: 'Veuillez entrer le texte du footer.', ephemeral: true });
                const filter = response => response.author.id === message.author.id;
                const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (collected.size > 0) {
                    const footerText = collected.first().content;
                    embed.setFooter({ text: footerText });
                    await embedMessage.edit({ embeds: [embed], components: [row1, row2, row3] });
                    await i.followUp({ content: 'Le texte du footer a été modifié.', ephemeral: true });
                }
            }
            
            if (i.customId === 'send_embed') {
                await i.reply({ content: 'Veuillez mentionner le salon où envoyer l\'embed.', ephemeral: true });
                const filter = response => response.mentions.channels.size > 0 && response.author.id === message.author.id;
                const channelCollected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
                if (channelCollected.size > 0) {
                    const targetChannel = channelCollected.first().mentions.channels.first();
                    await targetChannel.send({ embeds: [embed] });

                    // Sauvegarde l'embed dans un fichier JSON
                    saveEmbedToFile(embed.toJSON());

                    await i.followUp({ content: `Embed envoyé dans ${targetChannel}.`, ephemeral: true });
                }
            }

            if (i.customId === 'cancel') {
                await i.update({ content: 'Processus annulé.', components: [] });
                setTimeout(() => {
                    embedMessage.delete();
                }, 5000); // Supprime le message après 5 secondes
            }
        });
    }
};
