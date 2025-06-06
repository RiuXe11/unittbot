const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

// Chemin vers le fichier de configuration avec le nouveau chemin
const configPath = path.join(__dirname, '../../../data/set-prefix/config.json');

// Configuration par défaut
const defaultConfig = {
    defaultPrefix: '!',
    currentPrefix: '!'
};

// Fonction pour s'assurer que le dossier existe
function ensureDirectoryExists() {
    const directory = path.dirname(configPath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

// Fonction pour charger la configuration
function loadConfig() {
    try {
        ensureDirectoryExists(); // S'assure que le dossier existe
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath));
        }
        // Si le fichier n'existe pas, créer avec la config par défaut
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    } catch (error) {
        console.error('Erreur lors du chargement de la configuration:', error);
        return defaultConfig;
    }
}

// Fonction pour sauvegarder la configuration
function saveConfig(config) {
    try {
        ensureDirectoryExists();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        // Vérifie que le fichier a bien été écrit
        const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return true;
    } catch (error) {
        console.error('Erreur lors de la sauvegarde de la configuration:', error);
        return false;
    }
}

module.exports = {
    name: 'set-prefix',
    description: 'Gérer le préfixe du bot',
    async execute(message) {
        const serverColor = colorManager.getColor(message.guild.id);
        // Charge la configuration actuelle
        const config = loadConfig();

        // Création de l'embed
        const embed = new EmbedBuilder()
            .setTitle('🔧 Configuration du Préfixe')
            .setColor(serverColor)
            .addFields(
                { name: 'Préfixe actuel', value: `\`${config.currentPrefix}\``, inline: true },
                { name: 'Préfixe par défaut', value: `\`${config.defaultPrefix}\``, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Configuration du bot', iconURL: message.client.user.displayAvatarURL() });

        // Création des boutons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('define_prefix')
                    .setLabel('Définir un préfixe')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('create_prefix')
                    .setLabel('Créer')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('reset_prefix')
                    .setLabel('Réinitialiser')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
            );

        // Envoie l'embed avec les boutons
        const response = await message.reply({ embeds: [embed], components: [row] });

        // Création du collecteur de boutons
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button,
            time: 60000 // Le menu expire après 60 secondes
        });

        let newPrefix = null;

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ 
                    content: '❌ Vous ne pouvez pas utiliser ces boutons.', 
                    ephemeral: true 
                });
            }

            switch (interaction.customId) {
                //
                case 'define_prefix':
                    await interaction.reply({
                        content: 'Veuillez entrer le nouveau préfixe (maximum 1 caractère):',
                        ephemeral: true
                    });

                    const messageCollector = interaction.channel.createMessageCollector({
                        filter: m => m.author.id === interaction.user.id && m.content.length === 1,
                        max: 1,
                        time: 30000
                    });
                    
                    messageCollector.on('collect', async m => {
                        newPrefix = m.content;
                        // Active le bouton "Créer"
                        row.components[1].setDisabled(false);
                        
                        // Ajoute le champ du nouveau préfixe à l'embed avec un style différent
                        embed.spliceFields(2, 1); // Supprime l'ancien champ "Nouveau préfixe" s'il existe
                        embed.addFields({ 
                            name: '🔄 Nouveau préfixe', 
                            value: `\`${newPrefix}\``, // Simplifié l'affichage
                            inline: true 
                        });
                        
                        // Change aussi la couleur de l'embed pour indiquer qu'il y a un changement en cours
                        embed.setColor('#FFA500'); // Orange pour indiquer un changement en attente
                        
                        await response.edit({ embeds: [embed], components: [row] });
                        await m.delete().catch(() => {});
                    });

                    messageCollector.on('end', collected => {
                        if (collected.size === 0) {
                            interaction.followUp({
                                content: '❌ Temps écoulé ou préfixe invalide.',
                                ephemeral: true
                            });
                        }
                    });
                    break;

                case 'create_prefix':
                    if (!newPrefix) {
                        await interaction.reply({
                            content: '❌ Veuillez d\'abord définir un nouveau préfixe.',
                            ephemeral: true
                        });
                        return;
                    }
                    config.currentPrefix = newPrefix;
                    if (saveConfig(config)) {
                        // Met à jour le préfixe actuel et supprime le champ "Nouveau préfixe"
                        embed.data.fields[0].value = `\`${newPrefix}\``;
                        embed.spliceFields(2, 1); // Supprime le champ "Nouveau préfixe"
                        
                        // Remet la couleur d'origine
                        embed.setColor(serverColor);
                        
                        await response.edit({ embeds: [embed] });
                        await interaction.reply({
                            content: `✅ Le préfixe a été changé pour: \`${newPrefix}\``,
                            ephemeral: true
                        });
                    }
                    collector.stop();
                    break;

                case 'reset_prefix':
                    config.currentPrefix = config.defaultPrefix;
                    if (saveConfig(config)) {
                        // Met à jour le préfixe actuel et supprime le champ "Nouveau préfixe"
                        embed.data.fields[0].value = `\`${config.defaultPrefix}\``;
                        embed.spliceFields(2, 1); // Supprime le champ "Nouveau préfixe"
                        
                        // Remet la couleur d'origine
                        embed.setColor(serverColor);
                        
                        await response.edit({ embeds: [embed] });
                        await interaction.reply({
                            content: `✅ Le préfixe a été réinitialisé à: \`${config.defaultPrefix}\``,
                            ephemeral: true
                        });
                    }
                    collector.stop();
                    break;

                case 'cancel':
                    await response.delete().catch(() => {});
                    collector.stop();
                    break;
            }
        });

        collector.on('end', () => {
            if (!response.deleted) {
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        row.components.map(button => 
                            ButtonBuilder.from(button).setDisabled(true)
                        )
                    );
                response.edit({ components: [disabledRow] }).catch(() => {});
            }
        });
    },
};