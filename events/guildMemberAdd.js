const { EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        try {
            console.log('Nouvel utilisateur:', member.user.tag);
            
            const configPath = path.join(process.cwd(), 'data', 'welcome-messages', `${member.guild.id}.json`);
            console.log('Chemin du fichier de config:', configPath);
            
            const configDir = path.dirname(configPath);
            if (!fsSync.existsSync(configDir)) {
                console.log('Création du dossier de configuration');
                fsSync.mkdirSync(configDir, { recursive: true });
            }

            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configData);

                console.log('Configuration chargée:', config);

                // Gestion des messages simples
                if (config.messages?.length > 0) {
                    for (const messageConfig of config.messages) {
                        console.log('Traitement du message:', messageConfig);
                        
                        const channel = member.guild.channels.cache.get(messageConfig.channelId);
                        if (!channel) {
                            console.log('Canal introuvable pour message:', messageConfig.channelId);
                            continue;
                        }

                        const content = messageConfig.content
                            .replace(/{user}/g, member.toString())
                            .replace(/{server}/g, member.guild.name);

                        await channel.send({ content });
                    }
                }

                // Gestion des embeds
                if (config.embeds?.length > 0) {
                    for (const embedConfig of config.embeds) {
                        console.log('Traitement de l\'embed:', embedConfig);
                        
                        const channel = member.guild.channels.cache.get(embedConfig.channelId);
                        if (!channel) {
                            console.log('Canal introuvable pour embed:', embedConfig.channelId);
                            continue;
                        }

                        const embed = new EmbedBuilder()
                            .setTitle(embedConfig.title)
                            .setDescription(
                                embedConfig.description
                                    .replace(/{user}/g, member.toString())
                                    .replace(/{server}/g, member.guild.name)
                            )
                            .setColor(embedConfig.color || '#0099ff');

                        if (embedConfig.footer) {
                            embed.setFooter({ text: embedConfig.footer });
                        }

                        if (embedConfig.timestamp) {
                            embed.setTimestamp();
                        }

                        // Gestion de l'image dans l'embed
                        if (embedConfig.image) {
                            const imagePath = path.join(process.cwd(), 'data', 'welcome-images', embedConfig.image);
                            console.log('Chemin de l\'image:', imagePath);

                            try {
                                // Vérifier si l'image existe
                                await fs.access(imagePath);
                                
                                // Ajouter l'image à l'embed
                                embed.setImage(`attachment://${embedConfig.image}`);

                                // Envoyer l'embed avec l'image
                                await channel.send({
                                    embeds: [embed],
                                    files: [{
                                        attachment: imagePath,
                                        name: embedConfig.image // Utiliser le même nom pour la référence
                                    }]
                                });
                            } catch (error) {
                                console.error('Image non trouvée, envoi sans image:', error);
                                await channel.send({ embeds: [embed] });
                            }
                        } else {
                            await channel.send({ embeds: [embed] });
                        }
                    }
                }
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.log('Aucune configuration trouvée pour ce serveur');
                    return;
                }
                throw error;
            }
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message de bienvenue:', error);
            console.error('Détails de l\'erreur:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
    }
};