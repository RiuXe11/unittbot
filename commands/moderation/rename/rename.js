module.exports = {
    name: 'rename',
    description: 'Renomme le salon du ticket.',
    async execute(message, args) {
        // Vérifier si l'utilisateur est dans un salon de ticket
        const channel = message.channel;
        if (!channel.name.startsWith('ticket-')) {
            return message.reply('Vous ne pouvez utiliser cette commande que dans un salon de ticket.');
        }

        // Vérifier si l'utilisateur a fourni un nouveau nom
        if (!args.length) {
            return message.reply('Veuillez fournir un nouveau nom pour le ticket.');
        }

        // Vérifier les permissions de l'utilisateur
        const hasPermission = message.member.permissions.has('ManageChannels') || channel.name.includes(message.author.username.toLowerCase());
        if (!hasPermission) {
            return message.reply('Vous n\'avez pas la permission de renommer ce salon.');
        }

        // Obtenir le nouveau nom du salon à partir des arguments
        const newName = args.join('-').toLowerCase();

        try {
            // Renommer le salon
            await channel.setName(newName);
            message.reply(`Le salon a été renommé en ${newName}.`);
        } catch (error) {
            console.error('Erreur lors du renommage du salon:', error);
            message.reply('Une erreur est survenue lors du renommage du salon.');
        }
    }
};
