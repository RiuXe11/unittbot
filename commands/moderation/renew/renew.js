const { ChannelType } = require('discord.js');

module.exports = {
    name: 'renew',
    description: 'Recrée le salon avec les mêmes permissions et à la même position.',
    async execute(message, args) {
        // Récupérer le salon actuel
        const oldChannel = message.channel;

        // Optionnellement, obtenir un nouveau nom pour le salon
        const newName = args.length ? args.join('-') : oldChannel.name;

        try {
            // Récupérer la position actuelle du salon
            const position = oldChannel.position;

            // Récupérer les permissions du salon actuel
            const permissionOverwrites = oldChannel.permissionOverwrites.cache.map(overwrite => ({
                id: overwrite.id,
                type: overwrite.type,
                allow: overwrite.allow.toArray(),
                deny: overwrite.deny.toArray()
            }));

            // Créer le nouveau salon avec les mêmes paramètres
            const newChannel = await oldChannel.guild.channels.create({
                name: newName,
                type: ChannelType.GuildText,
                parent: oldChannel.parent,
                permissionOverwrites: permissionOverwrites,
                position: position, // Définir la position initiale
                topic: oldChannel.topic, // Conserver le sujet du salon
                nsfw: oldChannel.nsfw, // Conserver le statut NSFW
                rateLimitPerUser: oldChannel.rateLimitPerUser // Conserver le slowmode
            });

            // Supprimer l'ancien salon
            await oldChannel.delete();

            // Ajuster la position après la création
            // Nécessaire car Discord peut parfois ignorer la position initiale
            await newChannel.setPosition(position);

            // Envoyer un message temporaire dans le nouveau salon
            const tempMessage = await newChannel.send(`Le salon a été recréé par ${message.author}.`);
            setTimeout(() => tempMessage.delete(), 5000);

        } catch (error) {
            console.error('Erreur lors de la recréation du salon:', error);
            message.reply('Une erreur est survenue lors de la recréation du salon.')
                .then(msg => setTimeout(() => msg.delete(), 5000))
                .catch(err => console.error('Erreur lors de la suppression du message:', err));
        }
    }
};