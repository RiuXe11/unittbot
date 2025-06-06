const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

class ReminderScheduler {
    constructor(client) {
        this.client = client;
        this.jobs = new Map();
        this.remindersPath = path.join(__dirname, '../../data/reminder/reminders.json');

        // Créer le dossier data/reminder s'il n'existe pas
        const reminderDir = path.dirname(this.remindersPath);
        if (!fs.existsSync(reminderDir)) {
            fs.mkdirSync(reminderDir, { recursive: true });
        }

        // Surveiller les changements dans le fichier reminders.json
        fs.watch(path.dirname(this.remindersPath), (eventType, filename) => {
            if (filename === 'reminders.json') {
                this.reloadSchedule();
            }
        });
    }

    loadReminders() {
        try {
            if (fs.existsSync(this.remindersPath)) {
                const data = fs.readFileSync(this.remindersPath, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error('Erreur lors du chargement des reminders:', error);
            return {};
        }
    }

    async start() {
        console.log('Démarrage du scheduler de reminders...');
        await this.reloadSchedule();
    }

    async reloadSchedule() {
        console.log('Rechargement des reminders...');
        // Annuler tous les jobs existants
        this.stop();

        // Charger et planifier les nouveaux reminders
        const reminders = this.loadReminders();
        for (const [reminderId, reminder] of Object.entries(reminders)) {
            if (reminder.recurring && reminder.schedule) {
                await this.scheduleReminder(reminderId, reminder);
            }
        }
    }

    async scheduleReminder(reminderId, reminder) {
        if (!reminder.schedule) return;
    
        Object.entries(reminder.schedule).forEach(([day, times]) => {
            if (!Array.isArray(times)) return;
    
            times.forEach(time => {
                const [hour, minute] = time.split(':').map(Number);
                const dayNumber = this.getDayNumber(day);
    
                const rule = new schedule.RecurrenceRule();
                rule.dayOfWeek = dayNumber;
                rule.hour = hour;
                rule.minute = minute;
                rule.tz = 'Europe/Paris';
    
                const job = schedule.scheduleJob(rule, async () => {
                    try {
                        const channel = await this.client.channels.fetch(reminder.channel);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setTitle(reminder.title)
                                .setDescription(reminder.description || '')
                                .setColor(reminder.color || '#0099ff')
                                .setTimestamp();
    
                            const messageOptions = {
                                embeds: [embed]
                            };
    
                            if (reminder.message) {
                                messageOptions.content = reminder.message;
                            }
    
                            const reminderMessage = await channel.send(messageOptions);
    
                            if (reminder.reactions && Array.isArray(reminder.reactions) && reminder.reactions.length > 0) {
                                for (const reaction of reminder.reactions) {
                                    try {
                                        await reminderMessage.react(reaction);
                                        await new Promise(resolve => setTimeout(resolve, 300));
                                    } catch (error) {
                                        console.error(`Erreur lors de l'ajout de la réaction ${reaction}:`, error);
                                    }
                                }
                            }
    
                            console.log(`Reminder envoyé: ${reminder.title}`);
                        }
                    } catch (error) {
                        console.error(`Erreur lors de l'envoi du reminder ${reminderId}:`, error);
                    }
                });
    
                this.jobs.set(`${reminderId}_${day}_${time}`, job);
            });
        });
    }

    getDayNumber(day) {
        const dayMap = {
            'sunday': 0,
            'monday': 1,
            'tuesday': 2,
            'wednesday': 3,
            'thursday': 4,
            'friday': 5,
            'saturday': 6
        };
        return dayMap[day];
    }

    stop() {
        console.log('Arrêt des reminders...');
        this.jobs.forEach(job => job.cancel());
        this.jobs.clear();
    }
}

module.exports = ReminderScheduler;