const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// -------------------- Stockage des données temporaires --------------------
const tempReminders = new Map();
const selectedDays = new Map();
const processingInteractions = new Set();

// -------------------- Constantes --------------------
const TIMEOUT_DURATION = 30000; // 30 secondes
const REACTION_TIMEOUT = 60000; // 60 secondes

// -------------------- Gestion des fichiers --------------------
function logTempData(userId, action) {
    const tempData = tempReminders.get(userId);
    console.log(`[DEBUG] ${action} - Données temporaires pour l'utilisateur ${userId}:`, 
                tempData ? JSON.stringify(tempData, null, 2) : 'undefined');
}

function ensureRemindersFile() {
    const remindersPath = getRemindersPath();
    if (!fs.existsSync(remindersPath)) {
        ensureDirectoryExists(path.dirname(remindersPath));
        fs.writeFileSync(remindersPath, '{}');
    }
}

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (error) {
            console.error('Erreur lors de la création du dossier:', error);
            throw error;
        }
    }
}

function getRemindersPath() {
    return path.join(__dirname, '../../data/reminder/reminders.json');
}

function loadReminders() {
    const remindersPath = getRemindersPath();
    try {
        ensureDirectoryExists(path.dirname(remindersPath));
        if (fs.existsSync(remindersPath)) {
            const data = fs.readFileSync(remindersPath, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        console.error('Erreur lors du chargement des reminders:', error);
        return {};
    }
}

function saveReminders(reminders) {
    if (!reminders || typeof reminders !== 'object') {
        throw new Error('Invalid reminders data');
    }

    // Nettoyer l'objet reminders avant la sauvegarde
    const cleanedReminders = { ...reminders };
    delete cleanedReminders.reminders; // Supprimer la clé "reminders" vide

    const remindersPath = getRemindersPath();
    try {
        ensureDirectoryExists(path.dirname(remindersPath));
        fs.writeFileSync(remindersPath, JSON.stringify(cleanedReminders, null, 2));
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des reminders:', error);
        throw error;
    }
}

// -------------------- Utilitaires --------------------
function validateTimeFormat(time) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
}

function validateReminderData(data) {
    if (!data) {
        throw new Error('Aucune donnée de reminder trouvée.');
    }
    
    if (!data.channel) {
        throw new Error('Le salon est requis. Veuillez sélectionner un salon.');
    }
    
    if (!data.title) {
        throw new Error('Le titre est requis. Veuillez définir un titre.');
    }
    
    return true;
}

// Fonction utilitaire pour gérer les erreurs d'interaction
async function handleInteractionError(interaction, error, message = 'Une erreur est survenue.') {
    console.error('Erreur:', error);
    try {
        await safeInteractionResponse(interaction, {
            content: message,
            ephemeral: true
        }, false);
    } catch (followUpError) {
        console.error('Erreur lors de la gestion d\'erreur:', followUpError);
    }
}

// Fonction utilitaire pour les réponses aux interactions
async function safeInteractionResponse(interaction, responseData, isEdit = true) {
    try {
        // Si l'interaction est déjà en cours de traitement, on passe directement à editReply
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(responseData);
        }

        // Sinon, on diffère l'interaction selon le mode
        if (isEdit) {
            await interaction.deferUpdate().catch(() => {});
        } else {
            await interaction.deferReply({ ephemeral: true }).catch(() => {});
        }

        return await interaction.editReply(responseData);
    } catch (error) {
        console.error('Erreur lors de la réponse:', error);
        // En cas d'erreur, on essaie de répondre simplement si possible
        if (!interaction.replied) {
            try {
                return await interaction.reply({
                    content: 'Une erreur est survenue.',
                    ephemeral: true
                });
            } catch (err) {
                console.error('Erreur critique lors de la gestion d\'erreur:', err);
            }
        }
    }
}

// -------------------- Création des embeds --------------------
const createMainEmbed = (context) => {
    const guildId = context.guild?.id;
    if (!guildId) {
        throw new Error('Impossible de récupérer l\'ID du serveur');
    }
    const serverColor = colorManager.getColor(guildId);
    return new EmbedBuilder()
        .setTitle('Système de Reminder')
        .setDescription('Gérez vos rappels automatiques')
        .setColor(serverColor);
};

const createConfigEmbed = (userId, context, reminderId = null) => {
    const guildId = context.guild?.id;
    if (!guildId) {
        throw new Error('Impossible de récupérer l\'ID du serveur');
    }
    const serverColor = colorManager.getColor(guildId);
    const temp = tempReminders.get(userId) || {};
    
    const embed = new EmbedBuilder()
        .setTitle('Configuration du Reminder')
        .setDescription('Configurez votre reminder en utilisant les boutons ci-dessous')
        .setColor(serverColor)
        .addFields(
            { name: 'Salon', value: temp.channel ? `<#${temp.channel}>` : 'Non défini', inline: true },
            { name: 'Récurrence', value: temp.recurring ? 'Oui' : 'Non', inline: true },
            { name: 'Titre', value: temp.title || 'Non défini', inline: true },
            { name: 'Description', value: temp.description || 'Non défini', inline: true },
            { name: 'Couleur', value: temp.color || 'Non défini', inline: true }
        );

    if (temp.reactions && temp.reactions.length > 0) {
        embed.addFields({
            name: 'Réactions',
            value: temp.reactions.join(' '),
            inline: false
        });
    }

    if (temp.schedule && Object.keys(temp.schedule).length > 0) {
        const scheduleField = Object.entries(temp.schedule)
            .filter(([_, times]) => times?.length > 0)
            .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
            .join('\n');

        if (scheduleField) {
            embed.addFields({ name: 'Horaires configurés', value: scheduleField });
        }
    }

    if (temp.message) {
        embed.addFields({
            name: 'Message',
            value: temp.message,
            inline: false
        });
    }

    // Stocker l'ID du reminder dans un champ caché de l'embed
    if (reminderId) {
        embed.addFields({ 
            name: '\u200B', // Caractère invisible
            value: `reminder id : \`${reminderId}\``,
            inline: false 
        });
    }

    return embed;
};

// -------------------- Création des composants d'interface --------------------
const createMainMenu = () => {
    return new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('reminder_action')
                .setPlaceholder('Choisissez une action')
                .addOptions([
                    {
                        label: '➕ Créer un reminder',
                        value: 'create',
                        description: '👉 Créer un nouveau reminder'
                    },
                    {
                        label: '📝 Modifier un reminder',
                        value: 'modify',
                        description: '👉 Modifier un reminder existant'
                    },
                    {
                        label: '👀 Voir les reminders',
                        value: 'view',
                        description: '👉 Voir tous les reminders'
                    },
                    {
                        label: '❌ Supprimer un reminder',
                        value: 'delete',
                        description: '👉 Supprimer un reminder existant'
                    }
                ])
        );
};

function createReminderOptions(userId) {
    const reminderData = tempReminders.get(userId) || {};
    const isRecurring = Boolean(reminderData.recurring);
    
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_salon')
                .setLabel('Salon')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('reminder_titre')
                .setLabel('Titre')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('reminder_description')
                .setLabel('Description')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('reminder_message') 
                .setLabel('Message')
                .setStyle(ButtonStyle.Primary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_recurrence')
                .setLabel(`Récurrence`)
                .setStyle(isRecurring ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('reminder_temps')
                .setLabel('Temps')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!isRecurring),
            new ButtonBuilder()
                .setCustomId('reminder_couleur')
                .setLabel('Couleur')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('reminder_reaction')
                .setLabel('Réaction')
                .setStyle(ButtonStyle.Primary)
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_envoyer')
                .setLabel('Envoyer')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('reminder_annuler')
                .setLabel('Annuler')
                .setStyle(ButtonStyle.Danger)
        );

    return [row1, row2, row3];
}

// -------------------- Gestionnaires d'actions améliorés --------------------
async function handleCreateAction(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }
        
        ensureRemindersFile();
        
        const initialData = {
            channel: null,
            recurring: false,
            title: null,
            description: null,
            color: null,
            reactions: [],
            schedule: {},
            message: null
        };
        
        // Sauvegarder les données temporaires
        tempReminders.set(interaction.user.id, initialData);
        logTempData(interaction.user.id, 'CREATE');

        return await safeInteractionResponse(interaction, {
            embeds: [createConfigEmbed(interaction.user.id, interaction)],
            components: createReminderOptions(interaction.user.id)
        });
    } catch (error) {
        console.error('Erreur dans handleCreateAction:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleModifyAction(interaction) {
    try {
        // S'assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const reminders = loadReminders();
        const userReminders = Object.entries(reminders)
            .filter(([id, data]) => data.title)
            .map(([id, data]) => ({
                label: data.title || 'Sans titre',
                value: id,
                description: `Canal: ${interaction.guild.channels.cache.get(data.channel)?.name || 'inconnu'}`
            }));

        if (userReminders.length === 0) {
            return await interaction.editReply({
                content: "Vous n'avez aucun reminder à modifier.",
                ephemeral: true
            });
        }

        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('reminder_select_modify')
                    .setPlaceholder('Choisissez un reminder à modifier')
                    .addOptions(userReminders.slice(0, 25)) // Limite de 25 options
            );

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('📝 Modifier un Reminder')
                .setDescription('👉 Sélectionnez le reminder que vous souhaitez modifier')
                .setColor(colorManager.getColor(interaction.guild.id))],
            components: [selectMenu]
        });
    } catch (error) {
        console.error('Erreur dans handleModifyAction:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleSelectModify(interaction) {
    try {
        const reminderId = interaction.values[0];
        const reminders = loadReminders();
        const reminderData = reminders[reminderId];

        if (!reminderData) {
            return await safeInteractionResponse(interaction, {
                content: "Ce reminder n'existe plus.",
                ephemeral: true
            }, true);
        }

        // Copie profonde des données avec métadonnées
        const tempData = {
            ...JSON.parse(JSON.stringify(reminderData)),
            id: reminderId,          // Ajout explicite de l'ID
            isModifying: true        // Flag de modification
        };

        // Initialisation des champs obligatoires
        if (!tempData.schedule) tempData.schedule = {};
        if (!tempData.reactions) tempData.reactions = [];
        
        // Mise à jour des données temporaires
        tempReminders.set(interaction.user.id, tempData);
        
        // Debug log pour vérifier les données
        console.log('[DEBUG] handleSelectModify - ID:', reminderId);
        logTempData(interaction.user.id, 'MODIFY');

        // Initialisation des jours sélectionnés si nécessaire
        if (reminderData.recurring && reminderData.schedule) {
            const configuredDays = Object.keys(reminderData.schedule);
            selectedDays.set(interaction.user.id, configuredDays);
        }

        // Créer l'embed avec l'ID du reminder
        const configEmbed = createConfigEmbed(interaction.user.id, interaction, reminderId);

        // Utiliser safeInteractionResponse pour la réponse
        return await safeInteractionResponse(interaction, {
            embeds: [configEmbed],
            components: createReminderOptions(interaction.user.id)
        }, true);
    } catch (error) {
        console.error('Erreur dans handleSelectModify:', error);
        return await handleInteractionError(interaction, error);
    }
}

async function handleDeleteAction(interaction) {
    try {
        const reminders = loadReminders();
        const deleteOptions = Object.entries(reminders)
            .filter(([id, data]) => data.title)
            .map(([id, data]) => ({
                label: data.title || 'Sans titre',
                value: id,
                description: `Canal: ${interaction.guild.channels.cache.get(data.channel)?.name || 'inconnu'}`
            }));

        if (deleteOptions.length === 0) {
            await interaction.editReply({
                content: "Il n'y a aucun reminder à supprimer.",
                ephemeral: true
            }, false);
        }

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('❌ Supprimer un Reminder')
                .setDescription('👉 Sélectionnez le reminder que vous souhaitez supprimer')
                .setColor('#ff0000')],
            components: [new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('reminder_select_delete')
                        .setPlaceholder('Choisissez un reminder à supprimer')
                        .addOptions(deleteOptions)
                )]
        });
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
}

async function handleSelectDelete(interaction) {
    try {
        const reminderId = interaction.values[0];
        const reminders = loadReminders();

        if (!reminders[reminderId]) {
            await interaction.editReply({
                content: "Ce reminder n'existe plus.",
                ephemeral: true
            }, false);
        }

        delete reminders[reminderId];
        saveReminders(reminders);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle('Reminder Supprimé')
                .setDescription('Le reminder a été supprimé avec succès !')
                .setColor('#00FF00')],
            components: [new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('reminder_back_to_main')
                        .setLabel('Retour au menu')
                        .setStyle(ButtonStyle.Secondary)
                )]
        });
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
}

async function handleViewAction(interaction) {
    try {
        const reminders = loadReminders();
        const reminderList = Object.entries(reminders)
            .filter(([id, data]) => data.title);

        if (reminderList.length === 0) {
            await interaction.editReply({
                content: "Il n'y a aucun reminder à afficher.",
                ephemeral: true
            }, false);
        }

        const embed = new EmbedBuilder()
            .setTitle('Liste des Reminders')
            .setColor(colorManager.getColor(interaction.guild.id));

        for (const [id, data] of reminderList) {
            const channel = interaction.guild.channels.cache.get(data.channel);
            embed.addFields({
                name: data.title,
                value: `Canal: ${channel ? `#${channel.name}` : 'inconnu'}
Description: ${data.description || 'Aucune description'}
Récurrence: ${data.recurring ? 'Oui' : 'Non'}
${data.schedule ? `Horaires: ${Object.entries(data.schedule)
    .filter(([_, times]) => times?.length > 0)
    .map(([day, times]) => `\n${day}: ${times.join(', ')}`)
    .join('')}` : ''}`
            });
        }

        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('reminder_back_to_main')
                        .setLabel('Retour au menu')
                        .setStyle(ButtonStyle.Secondary)
                )]
        });
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
}

// -------------------- Gestionnaires des boutons --------------------
async function handleInputButton(interaction, promptMessage, filter, updateCallback) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        // Créer un embed spécifique pour le prompt
        const promptEmbed = createConfigEmbed(interaction.user.id, interaction);
        // Ajouter le message de prompt en tant que description supplémentaire
        promptEmbed.setDescription(`${promptEmbed.data.description}\n\n**${promptMessage}**`);

        await interaction.editReply({
            embeds: [promptEmbed],
            components: createReminderOptions(interaction.user.id)
        });

        // Le reste de la fonction reste identique
        const collected = await interaction.channel.awaitMessages({
            filter,
            max: 1,
            time: TIMEOUT_DURATION,
            errors: ['time']
        });

        const userMessage = collected.first();
        await userMessage.delete().catch(() => {});
        await updateCallback(userMessage);

        // Récupérer l'ID du reminder si en mode modification
        const reminderId = tempReminders.get(interaction.user.id)?.id;

        await interaction.editReply({
            embeds: [createConfigEmbed(interaction.user.id, interaction, reminderId)],
            components: createReminderOptions(interaction.user.id)
        });
    } catch (error) {
        console.error('Erreur dans handleInputButton:', error);
        try {
            const reminderId = tempReminders.get(interaction.user.id)?.id;
            await interaction.editReply({
                embeds: [createConfigEmbed(interaction.user.id, interaction, reminderId)],
                components: createReminderOptions(interaction.user.id)
            });
        } catch (secondaryError) {
            console.error('Erreur secondaire:', secondaryError);
        }
    }
}

// Exemple d'utilisation pour le bouton Description
async function handleDescriptionButton(interaction) {
    return handleInputButton(
        interaction,
        'Quelle description voulez-vous donner à votre reminder ?',
        m => m.author.id === interaction.user.id,
        async (message) => {
            const temp = tempReminders.get(interaction.user.id) || {};
            temp.description = message.content;
            tempReminders.set(interaction.user.id, temp);
        }
    );
}

// Exemple d'utilisation pour le bouton Titre
async function handleTitreButton(interaction) {
    return handleInputButton(
        interaction,
        'Quel titre voulez-vous donner à votre reminder ?',
        m => m.author.id === interaction.user.id,
        async (message) => {
            const temp = tempReminders.get(interaction.user.id) || {};
            temp.title = message.content;
            tempReminders.set(interaction.user.id, temp);
        }
    );
}

// Exemple d'utilisation pour le bouton Salon
async function handleSalonButton(interaction) {
    return handleInputButton(
        interaction,
        'Mentionnez le salon où vous souhaitez envoyer le reminder (exemple: #general)',
        m => {
            const mentionedChannel = m.mentions.channels.first();
            return m.author.id === interaction.user.id && mentionedChannel;
        },
        async (message) => {
            const temp = tempReminders.get(interaction.user.id) || {};
            const mentionedChannel = message.mentions.channels.first();
            temp.channel = mentionedChannel.id;
            tempReminders.set(interaction.user.id, temp);
        }
    );
}

// Exemple d'utilisation pour le bouton Couleur
async function handleCouleurButton(interaction) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return handleInputButton(
        interaction,
        'Quelle couleur voulez-vous donner à votre reminder ? (Format hexadécimal : #RRGGBB, exemple: #FF0000 pour rouge)',
        m => m.author.id === interaction.user.id && hexColorRegex.test(m.content),
        async (message) => {
            const temp = tempReminders.get(interaction.user.id) || {};
            temp.color = message.content.toUpperCase();
            tempReminders.set(interaction.user.id, temp);
        }
    );
}

async function handleMessageButton(interaction) {
    return handleInputButton(
        interaction,
        'Quel message voulez-vous afficher avant l\'embed ? (Vous pouvez mentionner des rôles avec @role)',
        m => m.author.id === interaction.user.id,
        async (message) => {
            const temp = tempReminders.get(interaction.user.id) || {};
            temp.message = message.content;
            tempReminders.set(interaction.user.id, temp);
        }
    );
}

const lastClickTimestamp = new Map();

async function handleRecurrenceButton(interaction) {
    try {
        // Protection contre les clics rapides
        const now = Date.now();
        const lastClick = lastClickTimestamp.get(interaction.user.id) || 0;
        if (now - lastClick < 1000) { // 1 seconde de délai minimum entre les clics
            return;
        }
        lastClickTimestamp.set(interaction.user.id, now);

        // S'assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        // Récupérer les données actuelles
        const temp = tempReminders.get(interaction.user.id) || {};
        
        // Créer une nouvelle copie des données avec l'état inversé
        const updatedTemp = {
            ...temp,
            recurring: !temp.recurring,
            schedule: !temp.recurring ? {} : (temp.schedule || {})
        };

        // Sauvegarder les modifications
        tempReminders.set(interaction.user.id, updatedTemp);

        // Mettre à jour l'interface
        const newEmbed = createConfigEmbed(interaction.user.id, interaction);
        const newComponents = createReminderOptions(interaction.user.id);

        await interaction.editReply({
            embeds: [newEmbed],
            components: newComponents
        }).catch(async (error) => {
            console.error('Erreur lors de la mise à jour:', error);
            // En cas d'erreur, attendre un peu et réessayer une fois
            await new Promise(resolve => setTimeout(resolve, 100));
            await interaction.editReply({
                embeds: [newEmbed],
                components: newComponents
            });
        });

    } catch (error) {
        console.error('Erreur dans handleRecurrenceButton:', error);
        await handleInteractionError(interaction, error);
    }
}

// -------------------- Gestionnaires du temps --------------------
const dayTranslations = {
    'monday': 'Lundi',
    'tuesday': 'Mardi',
    'wednesday': 'Mercredi',
    'thursday': 'Jeudi',
    'friday': 'Vendredi',
    'saturday': 'Samedi',
    'sunday': 'Dimanche'
};

const createDaysButtons = (userId) => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const selected = [...(selectedDays.get(userId) || [])];
    const temp = tempReminders.get(userId) || {};
    const hasSchedules = temp.schedule && Object.values(temp.schedule).some(times => times?.length > 0);

    const row1 = new ActionRowBuilder()
        .addComponents(
            days.slice(0, 3).map(day => 
                new ButtonBuilder()
                    .setCustomId(`reminder_day_${day}`)
                    .setLabel(dayTranslations[day])
                    .setStyle(selected.includes(day) ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            days.slice(3, 6).map(day => 
                new ButtonBuilder()
                    .setCustomId(`reminder_day_${day}`)
                    .setLabel(dayTranslations[day])
                    .setStyle(selected.includes(day) ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_day_${days[6]}`)
                .setLabel(dayTranslations[days[6]])
                .setStyle(selected.includes(days[6]) ? ButtonStyle.Success : ButtonStyle.Secondary),
        );
    
    const row4 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_time_configure')
                .setLabel('Définir Heure')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(selected.length === 0),
            new ButtonBuilder()
                .setCustomId('reminder_time_delete')
                .setLabel('Supprimer Horaire')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!hasSchedules),
            new ButtonBuilder()
                .setCustomId('reminder_time_back')
                .setLabel('Retour')
                .setStyle(ButtonStyle.Secondary)
        );

    return [row1, row2, row3, row4];
};

async function handleTempsButton(interaction) {
    try {
        // Assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const temp = tempReminders.get(interaction.user.id);
        if (!temp?.recurring) {
            return await interaction.editReply({
                content: 'La récurrence doit être activée pour configurer les horaires.',
                ephemeral: true
            });
        }

        // Initialiser la sélection des jours
        if (!selectedDays.has(interaction.user.id)) {
            selectedDays.set(interaction.user.id, []);
        }

        const timeEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
            .setColor(colorManager.getColor(interaction.guild.id));

        if (temp.schedule) {
            const scheduleField = Object.entries(temp.schedule)
                .filter(([_, times]) => times?.length > 0)
                .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
                .join('\n');

            if (scheduleField) {
                timeEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
            }
        }

        return await interaction.editReply({
            embeds: [timeEmbed],
            components: createDaysButtons(interaction.user.id)
        });
    } catch (error) {
        console.error('Erreur dans handleTempsButton:', error);
        return await handleInteractionError(interaction, error);
    }
}

const pendingInteractions = new Map();

async function handleDayButton(interaction) {
    try {
        // Vérifier si une interaction est déjà en cours pour cet utilisateur et ce jour
        const userId = interaction.user.id;
        const selectedDay = interaction.customId.split('_')[2];
        const interactionKey = `${userId}_${selectedDay}`;
        
        // Si une interaction est en cours, on l'ignore
        if (pendingInteractions.get(interactionKey)) {
            return;
        }
        
        // Marquer l'interaction comme en cours
        pendingInteractions.set(interactionKey, true);
        
        // Vérifier que l'interaction n'a pas encore été traitée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        let userSelectedDays = [...(selectedDays.get(userId) || [])];
        
        if (userSelectedDays.includes(selectedDay)) {
            userSelectedDays = userSelectedDays.filter(day => day !== selectedDay);
        } else {
            userSelectedDays.push(selectedDay);
        }
        
        // Sauvegarder la nouvelle sélection
        selectedDays.set(userId, userSelectedDays);

        const timeEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
            .setColor(colorManager.getColor(interaction.guild.id));

        const temp = tempReminders.get(userId);
        if (temp?.schedule) {
            const scheduleField = Object.entries(temp.schedule)
                .filter(([_, times]) => times?.length > 0)
                .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
                .join('\n');

            if (scheduleField) {
                timeEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
            }
        }

        await interaction.editReply({
            embeds: [timeEmbed],
            components: createDaysButtons(userId)
        });

    } catch (error) {
        console.error('Erreur dans handleDayButton:', error);
        await handleInteractionError(interaction, error);
    } finally {
        // Nettoyer l'interaction en cours après un délai
        const interactionKey = `${interaction.user.id}_${interaction.customId.split('_')[2]}`;
        setTimeout(() => {
            pendingInteractions.delete(interactionKey);
        }, 1000);
    }
}

async function handleTimeConfigureButton(interaction) {
    try {
        // S'assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const selectedDaysList = selectedDays.get(interaction.user.id);
        if (!selectedDaysList?.length) {
            return await interaction.editReply({
                content: 'Veuillez sélectionner au moins un jour avant de définir l\'heure.',
                ephemeral: true
            });
        }

        const timeConfigEmbed = new EmbedBuilder()
            .setTitle('Configuration de l\'Heure')
            .setDescription('Comment souhaitez-vous configurer l\'heure ?')
            .setColor(colorManager.getColor(interaction.guild.id));

        const timeConfigComponents = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('reminder_time_all')
                    .setLabel('Même heure pour tous les jours')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('reminder_time_individual')
                    .setLabel('Configurer chaque jour')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('reminder_time_back')
                    .setLabel('Retour')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.editReply({
            embeds: [timeConfigEmbed],
            components: [timeConfigComponents]
        });
    } catch (error) {
        console.error('Erreur dans handleTimeConfigureButton:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleTimeAllButton(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const reply = await interaction.editReply({
            content: 'Entrez l\'heure au format HH:mm (exemple: 18:30)',
            ephemeral: true
        });

        const collected = await interaction.channel.awaitMessages({
            filter: m => m.author.id === interaction.user.id && validateTimeFormat(m.content),
            max: 1,
            time: TIMEOUT_DURATION,
            errors: ['time']
        });

        const msg = collected.first();
        if (!msg) throw new Error('Temps écoulé');

        const time = msg.content;
        await msg.delete().catch(() => {});

        const temp = tempReminders.get(interaction.user.id) || {};
        const userSelectedDays = selectedDays.get(interaction.user.id) || [];

        if (!temp.schedule) temp.schedule = {};

        userSelectedDays.forEach(day => {
            if (!temp.schedule[day]) temp.schedule[day] = [];
            if (!temp.schedule[day].includes(time)) {
                temp.schedule[day].push(time);
                temp.schedule[day].sort();
            }
        });

        tempReminders.set(interaction.user.id, temp);

        const timeEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
            .setColor(colorManager.getColor(interaction.guild.id));

        if (temp.schedule) {
            const scheduleField = Object.entries(temp.schedule)
                .filter(([_, times]) => times?.length > 0)
                .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
                .join('\n');

            if (scheduleField) {
                timeEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
            }
        }

        return await interaction.editReply({
            content: null,
            embeds: [timeEmbed],
            components: createDaysButtons(interaction.user.id)
        });
    } catch (error) {
        console.error('Erreur dans handleTimeAllButton:', error);
        return await handleInteractionError(interaction, error, 'Une erreur est survenue ou le temps est écoulé. Veuillez réessayer.');
    }
}

async function handleTimeIndividualButton(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const selectedDaysForConfig = selectedDays.get(interaction.user.id) || [];
        const temp = tempReminders.get(interaction.user.id) || {};
        if (!temp.schedule) temp.schedule = {};

        // Premier affichage
        let timeEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('Entrez les heures pour chaque jour sélectionné')
            .setColor(colorManager.getColor(interaction.guild.id));

        await interaction.editReply({
            content: `Entrez l'heure pour ${selectedDaysForConfig[0]} au format HH:mm (exemple: 18:30)`,
            embeds: [timeEmbed],
            components: []
        });

        // Traiter chaque jour séquentiellement
        for (const day of selectedDaysForConfig) {
            try {
                const collected = await interaction.channel.awaitMessages({
                    filter: m => m.author.id === interaction.user.id && validateTimeFormat(m.content),
                    max: 1,
                    time: TIMEOUT_DURATION,
                    errors: ['time']
                });

                const message = collected.first();
                if (message) {
                    const time = message.content;
                    
                    // Mettre à jour le schedule
                    if (!temp.schedule[day]) temp.schedule[day] = [];
                    if (!temp.schedule[day].includes(time)) {
                        temp.schedule[day].push(time);
                        temp.schedule[day].sort();
                    }

                    // Supprimer le message de l'utilisateur
                    await message.delete().catch(() => {});

                    // Mettre à jour l'affichage pour le prochain jour (s'il y en a un)
                    const nextDay = selectedDaysForConfig[selectedDaysForConfig.indexOf(day) + 1];
                    if (nextDay) {
                        await interaction.editReply({
                            content: `Entrez l'heure pour ${nextDay} au format HH:mm (exemple: 18:30)`,
                            embeds: [timeEmbed],
                            components: []
                        });
                    }
                }
            } catch (error) {
                console.error(`Erreur pour ${day}:`, error);
                continue;
            }
        }

        // Sauvegarder les modifications
        tempReminders.set(interaction.user.id, temp);

        // Créer l'embed final
        const finalEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
            .setColor(colorManager.getColor(interaction.guild.id));

        // Ajouter les horaires configurés
        const scheduleField = Object.entries(temp.schedule)
            .filter(([_, times]) => times?.length > 0)
            .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
            .join('\n');

        if (scheduleField) {
            finalEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
        }

        // Affichage final
        await interaction.editReply({
            content: null,
            embeds: [finalEmbed],
            components: createDaysButtons(interaction.user.id)
        });

    } catch (error) {
        console.error('Erreur dans handleTimeIndividualButton:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleDeleteTimeSelect(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const [day, time] = interaction.values[0].split('_');
        const temp = tempReminders.get(interaction.user.id);

        if (temp?.schedule?.[day]) {
            temp.schedule[day] = temp.schedule[day].filter(t => t !== time);
            if (temp.schedule[day].length === 0) {
                delete temp.schedule[day];
            }
            tempReminders.set(interaction.user.id, temp);
        }

        const timeEmbed = new EmbedBuilder()
            .setTitle('Configuration du Temps')
            .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
            .setColor(colorManager.getColor(interaction.guild.id));

        if (temp?.schedule) {
            const scheduleField = Object.entries(temp.schedule)
                .filter(([_, times]) => times?.length > 0)
                .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
                .join('\n');

            if (scheduleField) {
                timeEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
            }
        }

        await interaction.editReply({
            content: null,
            embeds: [timeEmbed],
            components: createDaysButtons(interaction.user.id)
        });

    } catch (error) {
        console.error('Erreur dans handleDeleteTimeSelect:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleTimeDeleteButton(interaction) {
    try {
        // S'assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const temp = tempReminders.get(interaction.user.id);
        if (!temp?.schedule || Object.keys(temp.schedule).length === 0) {
            return await interaction.editReply({
                content: 'Aucun horaire à supprimer.',
                ephemeral: true
            });
        }

        // Créer les options pour le menu de sélection
        const scheduleOptions = Object.entries(temp.schedule)
            .filter(([day, times]) => times && times.length > 0)
            .flatMap(([day, times]) => 
                times.map(time => ({
                    label: `${day.charAt(0).toUpperCase() + day.slice(1)} - ${time}`,
                    value: `${day}_${time}`,
                    description: `Supprimer l'horaire ${time} pour ${day}`
                }))
            );

        if (scheduleOptions.length === 0) {
            return await interaction.editReply({
                content: 'Aucun horaire trouvé à supprimer.',
                ephemeral: true
            });
        }

        const deleteMenu = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('reminder_delete_time')
                    .setPlaceholder('Sélectionnez l\'horaire à supprimer')
                    .addOptions(scheduleOptions)
            );

        const backButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('reminder_time_back')
                    .setLabel('Retour')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            content: 'Sélectionnez l\'horaire que vous souhaitez supprimer :',
            components: [deleteMenu, backButton]
        });

    } catch (error) {
        console.error('Erreur dans handleTimeDeleteButton:', error);
        await handleInteractionError(interaction, error);
    }
}

async function handleTimeBackButton(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const temp = tempReminders.get(interaction.user.id);
        
        // Vérifier si nous sommes dans le menu de suppression (présence du menu de sélection)
        const isInDeleteMenu = interaction.message?.components?.some(row => 
            row.components?.some(component => component.customId === 'reminder_delete_time')
        );
        
        if (isInDeleteMenu) {
            // Retour à la configuration des jours
            const timeEmbed = new EmbedBuilder()
                .setTitle('Configuration du Temps')
                .setDescription('1. Sélectionnez les jours où vous souhaitez recevoir le reminder\n2. Cliquez sur "Définir Heure" pour configurer les horaires')
                .setColor(colorManager.getColor(interaction.guild.id));

            if (temp?.schedule) {
                const scheduleField = Object.entries(temp.schedule)
                    .filter(([_, times]) => times?.length > 0)
                    .map(([day, times]) => `${day.charAt(0).toUpperCase() + day.slice(1)}: ${times.join(', ')}`)
                    .join('\n');

                if (scheduleField) {
                    timeEmbed.addFields({ name: 'Horaires configurés', value: scheduleField });
                }
            }

            await interaction.editReply({
                content: null,
                embeds: [timeEmbed],
                components: createDaysButtons(interaction.user.id)
            });
        } else {
            // Retour au menu principal de configuration
            await interaction.editReply({
                embeds: [createConfigEmbed(interaction.user.id, interaction)],
                components: createReminderOptions(interaction.user.id)
            });
        }
    } catch (error) {
        console.error('Erreur dans handleTimeBackButton:', error);
        await handleInteractionError(interaction, error);
    }
}

// -------------------- Gestionnaires des réactions --------------------
async function handleReactionButton(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const embed = new EmbedBuilder()
            .setTitle('Configuration des Réactions')
            .setDescription('Envoyez l\'émoji ou les émojis que vous souhaitez utiliser (exemple: 👍 ou 👍 😊 🎉)\n\nVous pouvez envoyer plusieurs émojis dans un seul message en les séparant par des espaces.')
            .setColor(colorManager.getColor(interaction.guild.id));

        // Utiliser safeInteractionResponse au lieu de editReply directement
        await safeInteractionResponse(interaction, {
            embeds: [embed],
            components: [new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('reminder_reaction_cancel')
                        .setLabel('Annuler')
                        .setStyle(ButtonStyle.Danger)
                )]
        });

        const collected = await interaction.channel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: REACTION_TIMEOUT
        });

        if (collected.size > 0) {
            const message = collected.first();
            await message.delete().catch(() => {});

            const emojis = message.content.trim().split(/\s+/);
            const temp = tempReminders.get(interaction.user.id) || {};
            temp.reactions = emojis;
            tempReminders.set(interaction.user.id, temp);

            const reminderId = temp.id;
            await safeInteractionResponse(interaction, {
                embeds: [createConfigEmbed(interaction.user.id, interaction, reminderId)],
                components: createReminderOptions(interaction.user.id)
            });
        }
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
}

// -------------------- Gestionnaires finaux --------------------
function backupAndRestoreReminderData(interaction) {
    const userId = interaction.user.id;
    const embedFields = interaction.message?.embeds[0]?.fields;
    const embedTitle = interaction.message?.embeds[0]?.title;

    if (!embedFields) return null;

    // Rechercher l'ID du reminder dans les champs de l'embed
    const reminderIdField = embedFields.find(f => f.value?.startsWith('reminder_id:'));
    const reminderId = reminderIdField?.value.split(':')[1];

    const isModifying = Boolean(
        reminderId && 
        embedTitle === 'Configuration du Reminder'
    );

    // Log de debug détaillé
    console.log('[DEBUG] Restauration des données:');
    console.log('- Reminder ID:', reminderId);
    console.log('- Is Modifying:', isModifying);

    // Essayer de reconstituer les données à partir de l'embed
    const reminderData = {
        channel: embedFields[0]?.value?.match(/\d+/)?.[0],
        recurring: embedFields[1]?.value === 'Oui',
        title: embedFields[2]?.value === 'Non défini' ? null : embedFields[2]?.value,
        description: embedFields[3]?.value === 'Non défini' ? null : embedFields[3]?.value,
        color: embedFields[4]?.value === 'Non défini' ? null : embedFields[4]?.value,
        message: embedFields.find(f => f.name === 'Message')?.value || null,
        reactions: [],
        schedule: {},
        id: isModifying ? reminderId : null,
        isModifying: isModifying
    };

    // Vérifier si l'embed contient des réactions
    const reactionField = embedFields.find(f => f.name === 'Réactions');
    if (reactionField) {
        reminderData.reactions = reactionField.value.split(' ').filter(Boolean);
    }

    // Vérifier si l'embed contient des horaires
    const scheduleField = embedFields.find(f => f.name === 'Horaires configurés');
    if (scheduleField) {
        const scheduleLines = scheduleField.value.split('\n');
        scheduleLines.forEach(line => {
            const [day, times] = line.split(': ');
            if (day && times) {
                const dayLower = day.toLowerCase();
                reminderData.schedule[dayLower] = times.split(', ');
            }
        });
    }

    // Debug log des données finales
    console.log('[DEBUG] Données reconstruites:', JSON.stringify(reminderData, null, 2));

    // Sauvegarder les données reconstituées
    tempReminders.set(userId, reminderData);
    return reminderData;
}

// Modification dans handleEnvoyerButton pour la vérification du mode modification
async function handleEnvoyerButton(interaction) {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(console.error);
        }

        // Récupération des données temporaires
        let reminderData = tempReminders.get(interaction.user.id);
        
        if (!reminderData) {
            reminderData = backupAndRestoreReminderData(interaction);
            console.log('[DEBUG] Données restaurées depuis l\'embed');
        }

        // Validation des données
        if (!reminderData || !reminderData.channel || !reminderData.title) {
            throw new Error('La configuration est incomplète. Le salon et le titre sont requis.');
        }

        // Charger les reminders existants
        const reminders = loadReminders();
        
        // Vérification stricte du mode modification
        const isModifying = Boolean(reminderData.isModifying && reminderData.id);
        
        // Vérification des doublons
        const isDuplicate = Object.entries(reminders).some(([id, reminder]) => {
            if (isModifying && id === reminderData.id) return false; // Ignorer le reminder en cours de modification
            return reminder.channel === reminderData.channel &&
                   reminder.title === reminderData.title &&
                   JSON.stringify(reminder.schedule) === JSON.stringify(reminderData.schedule);
        });

        if (isDuplicate) {
            throw new Error('Un reminder identique existe déjà pour ce salon avec le même titre et les mêmes horaires.');
        }

        // Génération d'un ID unique pour les nouveaux reminders
        const reminderId = isModifying ? reminderData.id : `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`[DEBUG] handleEnvoyerButton - Mode: ${isModifying ? 'Modification' : 'Création'}, ID: ${reminderId}`);

        // Préparer les données à sauvegarder
        const reminderToSave = { ...reminderData };
        delete reminderToSave.id;
        delete reminderToSave.isModifying;

        if (isModifying && !reminders[reminderId]) {
            console.log('[DEBUG] Tentative de modification d\'un reminder inexistant:', reminderId);
            throw new Error('Le reminder à modifier n\'existe plus.');
        }

        // Nettoyer les données avant sauvegarde
        if (reminderToSave.schedule) {
            Object.keys(reminderToSave.schedule).forEach(day => {
                if (!reminderToSave.schedule[day] || reminderToSave.schedule[day].length === 0) {
                    delete reminderToSave.schedule[day];
                }
            });
        }

        // Sauvegarder les données
        reminders[reminderId] = reminderToSave;
        saveReminders(reminders);
        
        // Nettoyage
        tempReminders.delete(interaction.user.id);
        selectedDays.delete(interaction.user.id);

        return await safeInteractionResponse(interaction, {
            embeds: [new EmbedBuilder()
                .setTitle(`Reminder ${isModifying ? 'Modifié' : 'Créé'}`)
                .setDescription(`Votre reminder a été ${isModifying ? 'modifié' : 'créé'} avec succès !`)
                .setColor('#00FF00')],
            components: [new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('reminder_back_to_main')
                        .setLabel('Retour au menu')
                        .setStyle(ButtonStyle.Secondary)
                )]
        }, true);
    } catch (error) {
        console.error('Erreur dans handleEnvoyerButton:', error);
        return await handleInteractionError(interaction, error, error.message);
    }
}

async function handleAnnulerButton(interaction) {
    try {
        // S'assurer que l'interaction est différée
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        // Nettoyer les données temporaires
        tempReminders.delete(interaction.user.id);
        selectedDays.delete(interaction.user.id);
        
        // Utiliser safeInteractionResponse pour la réponse
        return await safeInteractionResponse(interaction, {
            embeds: [createMainEmbed(interaction)],
            components: [createMainMenu()]
        });
    } catch (error) {
        console.error('Erreur dans handleAnnulerButton:', error);
        await handleInteractionError(interaction, error);
    }
}

// Mettre à jour le gestionnaire principal des interactions
const handlers = {
    'salon': handleSalonButton,
    'titre': handleTitreButton,
    'description': handleDescriptionButton,
    'message': handleMessageButton,
    'couleur': handleCouleurButton,
    'recurrence': handleRecurrenceButton,
    'temps': handleTempsButton,
    'envoyer': handleEnvoyerButton,
    'annuler': handleAnnulerButton,
    'reaction': handleReactionButton,
    'time_configure': handleTimeConfigureButton,
    'time_all': handleTimeAllButton,
    'time_individual': handleTimeIndividualButton,
    'time_back': handleTimeBackButton,
    'day': handleDayButton,
    'time_delete': handleTimeDeleteButton,
    'delete_time': handleDeleteTimeSelect
};

// -------------------- Gestionnaire principal des interactions amélioré --------------------
async function handleInteraction(interaction) {
    if (!interaction.customId?.startsWith('reminder_')) return;

    // Vérifier si l'interaction est déjà en cours de traitement
    const interactionKey = `${interaction.user.id}_${interaction.customId}`;
    if (processingInteractions.has(interactionKey)) {
        console.log('[DEBUG] Interaction déjà en cours de traitement:', interactionKey);
        return;
    }

    try {
        // Marquer l'interaction comme en cours de traitement
        processingInteractions.add(interactionKey);

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferUpdate().catch(() => {});
        }

        const [prefix, action, subaction] = interaction.customId.split('_');
        
        // Gérer le bouton de retour au menu principal
        if (interaction.customId === 'reminder_back_to_main') {
            return await safeInteractionResponse(interaction, {
                embeds: [createMainEmbed(interaction)],
                components: [createMainMenu()]
            });
        }

        // Gérer les menus de sélection
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'reminder_delete_time') {
                await handleDeleteTimeSelect(interaction);
                return;
            }

            if (interaction.customId === 'reminder_action') {
                const actionHandlers = {
                    'create': handleCreateAction,
                    'modify': handleModifyAction,
                    'view': handleViewAction,
                    'delete': handleDeleteAction
                };
                const handler = actionHandlers[interaction.values[0]];
                if (handler) await handler(interaction);
                return;
            }
            
            if (interaction.customId === 'reminder_select_modify') {
                await handleSelectModify(interaction);
                return;
            }
            
            if (interaction.customId === 'reminder_select_delete') {
                await handleSelectDelete(interaction);
                return;
            }
        }

        // Gérer les boutons
        if (interaction.isButton()) {
            // Si c'est un bouton de jour
            if (action === 'day') {
                await handleDayButton(interaction);
                return;
            }

            // Pour tous les autres boutons
            const handlerKey = subaction ? `${action}_${subaction}` : action;
            const handler = handlers[handlerKey];
            if (handler) {
                await handler(interaction);
                return;
            }
        }
    } catch (error) {
        console.error('Erreur dans le gestionnaire d\'interactions:', error);
        await handleInteractionError(interaction, error);
    } finally {
        // Retirer l'interaction de la liste des traitements en cours après un court délai
        setTimeout(() => {
            processingInteractions.delete(interactionKey);
            console.log('[DEBUG] Interaction terminée et nettoyée:', interactionKey);
        }, 1000);
    }
}

// -------------------- Exports --------------------
module.exports = {
    name: 'reminder',  // Ceci doit correspondre au premier segment de vos customId
    description: 'Gérer les reminders',
    execute: async function(message, args) {
        const embed = createMainEmbed(message);
        const menu = createMainMenu();
        await message.reply({ embeds: [embed], components: [menu] });
    },
    handleInteraction
};