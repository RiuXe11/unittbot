const { EmbedBuilder } = require('discord.js');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

module.exports = {
    name: 'invite',
    description: 'Affiche le lien d\'invitation du bot',
    async execute(message, client, args) {
        try {
            if (!client || !client.user) {
                throw new Error('Client non initialisé');
            }

            // Vérifier si le message vient d'un serveur et obtenir la couleur en conséquence
            const serverColor = message.guild ? colorManager.getColor(message.guild.id) : '#0099ff';
            
            const inviteLink = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&integration_type=0&scope=bot`;
            
            // Création de l'embed
            const inviteEmbed = new EmbedBuilder()
                .setColor(serverColor)
                .setTitle(`Inviter ${client.user.username}`)
                .setDescription(`Voici le lien d'invitation!\n-> [Cliques ici pour m'inviter](${inviteLink}) `)
                .setThumbnail(client.user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ 
                    text: `Demandé par ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL()
                });

            // Envoi de l'embed
            await message.channel.send({ embeds: [inviteEmbed] });
        } catch (error) {
            console.error('Erreur dans la commande invite:', error);
            await message.channel.send('Une erreur est survenue lors de la création du lien d\'invitation. Veuillez réessayer plus tard.');
        }
    },
};