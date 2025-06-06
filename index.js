const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { checkPermission } = require('./commands/moderation/permissionManager/permissionManager');
const vocalManager = require('./commands/vocal/vocal.js'); 
const fs = require("fs");
const dotenv = require('dotenv');
const path = require("path");

dotenv.config();

const prefixConfigPath = path.join(__dirname, 'data/set-prefix/config.json');
let config = { defaultPrefix: '!', currentPrefix: '!' };

const loadPrefixConfig = () => {
    try {
        if (fs.existsSync(prefixConfigPath)) {
            const data = fs.readFileSync(prefixConfigPath, 'utf8');
            config = JSON.parse(data); 
            return config;
        }
        return config;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration du préfixe:', error);
        return config;
    }
};

loadPrefixConfig();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

client.commands = new Collection();

const loadCommands = (directory) => {
    try {
        const commandFiles = fs.readdirSync(directory, { withFileTypes: true });

        for (const file of commandFiles) {
            try {
                if (file.isDirectory()) {
                    loadCommands(path.join(directory, file.name));
                } else if (file.name.endsWith('.js')) {
                    const filePath = path.join(directory, file.name);
                    const command = require(filePath);

                    if (command.name && command.execute) {
                        client.commands.set(command.name, command);
                    } else {
                        console.error(`Le fichier ${file.name} ne contient pas de 'name' ou 'execute' valide.`);
                    }
                }
            } catch (error) {
                console.error(`Erreur lors du chargement de la commande ${file.name}:`, error);
            }
        }
    } catch (error) {
        console.error(`Erreur lors de la lecture du répertoire ${directory}:`, error);
    }
};

const loadEvents = (directory) => {
    try {
        const eventFiles = fs.readdirSync(directory, { withFileTypes: true });

        for (const file of eventFiles) {
            try {
                if (file.isDirectory()) {
                    loadEvents(path.join(directory, file.name));
                } else if (file.name.endsWith('.js')) {
                    const filePath = path.join(directory, file.name);
                    const event = require(filePath);

                    if (event.name) {
                        const eventHandler = (...args) => {
                            try {
                                event.execute(...args);
                            } catch (error) {
                                console.error(`Erreur lors de l'exécution de l'événement ${event.name}:`, error);
                            }
                        };

                        if (event.once) {
                            client.once(event.name, eventHandler);
                        } else {
                            client.on(event.name, eventHandler);
                        }
                    } else {
                        console.error(`Le fichier ${file.name} ne contient pas de 'name' valide.`);
                    }
                }
            } catch (error) {
                console.error(`Erreur lors du chargement de l'événement ${file.name}:`, error);
            }
        }
    } catch (error) {
        console.error(`Erreur lors de la lecture du répertoire ${directory}:`, error);
    }
};

loadCommands(path.join(__dirname, 'commands'));
loadEvents(path.join(__dirname, 'events'));

fs.watchFile(prefixConfigPath, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log('Configuration du préfixe modifiée, rechargement...');
        loadPrefixConfig();
    }
});

client.on('messageCreate', async message => {
    try {
        config = loadPrefixConfig();
        
        if (!message.content.startsWith(config.currentPrefix) || message.author.bot) return;

        const args = message.content.slice(config.currentPrefix.length).split(/ +/);
        const commandName = args.shift().toLowerCase();

        const command = client.commands.get(commandName);
        if (!command) return;

        // Attendre que le client soit complètement initialisé
        if (!client.readyAt) {
            return message.reply('❌ Le bot est en cours d\'initialisation. Veuillez patienter quelques instants.');
        }

        if (!checkPermission(message.member, commandName)) {
            return message.reply('❌ Vous n\'avez pas la permission d\'utiliser cette commande.');
        }

        await command.execute(message, args, client);  // Assurez-vous que client est passé en troisième argument
    } catch (error) {
        console.error('Erreur dans messageCreate:', error);
        message.reply('Une erreur est survenue lors de l\'exécution de la commande.').catch(console.error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    if (!interaction.customId) return;

    try {
        if (interaction.customId.startsWith('msg-')) {
            return;
        }

        // Ajout de la gestion des tickets
        if (interaction.customId === 'channelName' || 
            interaction.customId === 'logChannel' ||
            interaction.customId === 'ticketName' ||
            interaction.customId === 'description' ||
            interaction.customId === 'category' ||
            interaction.customId === 'send' ||
            interaction.customId === 'create' ||
            interaction.customId === 'cancel' ||
            interaction.customId === 'close_ticket' ||
            interaction.customId === 'confirm_close' ||
            interaction.customId === 'cancel_close' ||
            interaction.customId === 'claim_ticket') {
            const command = client.commands.get('ticket');
            if (command) {
                return await command.handleInteraction(interaction);
            }
        }

        if (interaction.customId.startsWith('voice-') || 
            interaction.customId.startsWith('set-') || 
            interaction.customId.startsWith('toggle-') ||
            interaction.customId === 'send-config' || 
            interaction.customId === 'cancel-config') {
            return await vocalManager.handleInteraction(interaction);
        } 

        if (interaction.customId.startsWith('join-settings')) {
            const command = client.commands.get('join-settings');
            if (command) {
                return await command.handleInteraction(interaction);
            }
        }

        const commandName = interaction.customId.split('-')[0];
        const command = client.commands.get(commandName);
        if (command) {
            return await command.handleInteraction(interaction);
        }

    } catch (error) {
        console.error(`Erreur dans le gestionnaire d'interactions:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Une erreur est survenue.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: 'Une erreur est survenue.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Erreur lors de la réponse d\'erreur:', replyError);
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        await vocalManager.handleVoiceStateUpdate(oldState, newState, client);
    } catch (error) {
        console.error('Erreur dans voiceStateUpdate:', error);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('Erreur lors de la connexion du bot:', error);
    process.exit(1);
});