const { Events, ActivityType } = require("discord.js");
const ReminderScheduler = require('../commands/reminder/reminderScheduler');
const statusCommand = require('../commands/moderation/status/status');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            // Initialisation du ReminderScheduler
            const reminderScheduler = new ReminderScheduler(client);
            await reminderScheduler.start();
            console.log('✅ | ReminderScheduler initialisé avec succès');

            // Initialiser le statut
            await statusCommand.initStatus(client);
            console.log('✅ | Statut du bot initialisé');
            
            console.log(`✅ | Le bot ${client.user.tag} est prêt !`);

            // Stocker le scheduler dans le client pour y accéder ailleurs si nécessaire
            client.reminderScheduler = reminderScheduler;

            // Gérer l'arrêt propre du bot
            process.on('SIGINT', () => {
                console.log('Arrêt du bot...');
                if (client.reminderScheduler) {
                    client.reminderScheduler.stop();
                }
                client.destroy();
                process.exit(0);
            });
        } catch (error) {
            console.error('❌ | Erreur lors de l\'initialisation:', error);
        }
    },
};