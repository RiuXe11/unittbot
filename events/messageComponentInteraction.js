const { handleInteraction } = require('../commands/reminder/reminder');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('reminder_')) return;

        await handleInteraction(interaction);
    }
};