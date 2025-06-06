const { handleAutoMessage } = require('../commands/messages/auto-message');
const { loadKeywords, applySanction } = require('../commands/keyword/keyword');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return;

        // Garder la fonctionnalité existante
        handleAutoMessage(message);

        // Ajouter la détection des mots-clés
        try {
            const keywords = await loadKeywords();
            const messageContent = message.content.toLowerCase();

            for (const keywordConfig of keywords) {
                if (messageContent.includes(keywordConfig.keyword.toLowerCase())) {

                    if (keywordConfig.reaction) {
                        try {
                            if (keywordConfig.reaction.isCustom) {
                                await message.react(keywordConfig.reaction.id);
                            } else {
                                await message.react(keywordConfig.reaction.name);
                            }
                        } catch (error) {
                            console.error('Erreur lors de l\'ajout de la réaction:', error);
                        }
                    }

                    if (keywordConfig.isEmbed) {
                        const embed = new EmbedBuilder()
                            .setTitle(keywordConfig.title || '')
                            .setDescription(keywordConfig.description || '')
                            .setColor(keywordConfig.color || '#0099ff');

                        if (keywordConfig.footer) {
                            embed.setFooter({ text: keywordConfig.footer });
                        }

                        if (keywordConfig.hasTimestamp) {
                            embed.setTimestamp();
                        }

                        await message.channel.send({ embeds: [embed] });
                    } else if (keywordConfig.message) {
                        await message.channel.send(keywordConfig.message);
                    }
                }
            }
        } catch (error) {
            console.error('Erreur dans la détection des mots-clés:', error);
        }
    }
};