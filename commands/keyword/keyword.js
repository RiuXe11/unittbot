const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

const KEYWORDS_FILE = path.join(__dirname, '../../data/keyword/keyword.json');

// Charge les mots-clés
async function loadKeywords() {
    try {
        await ensureFile();
        const data = await fs.readFile(KEYWORDS_FILE, 'utf8');
        let keywords = [];
        try {
            keywords = JSON.parse(data);
            // Vérifier si keywords est un tableau, sinon initialiser un tableau vide
            if (!Array.isArray(keywords)) {
                keywords = [];
                // Sauvegarder le tableau vide dans le fichier
                await saveKeywords(keywords);
            }
        } catch (parseError) {
            console.error('Erreur lors du parsing du JSON:', parseError);
            keywords = [];
            // Sauvegarder le tableau vide dans le fichier
            await saveKeywords(keywords);
        }
        return keywords;
    } catch (error) {
        console.error('Erreur lors du chargement des mots-clés:', error);
        return [];
    }
}

async function ensureFile() {
    try {
        await fs.access(KEYWORDS_FILE);
        // Vérifier si le fichier contient un JSON valide
        const data = await fs.readFile(KEYWORDS_FILE, 'utf8');
        try {
            const content = JSON.parse(data);
            if (!Array.isArray(content)) {
                throw new Error('Le contenu n\'est pas un tableau');
            }
        } catch (error) {
            // Si le fichier n'est pas un JSON valide ou pas un tableau, le réinitialiser
            await fs.writeFile(KEYWORDS_FILE, JSON.stringify([], null, 2));
        }
    } catch {
        // Si le fichier n'existe pas, créer le dossier et le fichier
        await fs.mkdir(path.dirname(KEYWORDS_FILE), { recursive: true });
        await fs.writeFile(KEYWORDS_FILE, JSON.stringify([], null, 2));
    }
}

// Sauvegarde les mots-clés
async function saveKeywords(keywords) {
    await fs.writeFile(KEYWORDS_FILE, JSON.stringify(keywords, null, 2));
}

// Crée l'embed principal
const createMainEmbed = (keywords, guild) => {
    const embed = new EmbedBuilder()
        .setTitle('Système de mots-clés')
        .setDescription('Gérez vos mots-clés qui déclencheront des réponses automatiques.')
        .setColor(guild ? colorManager.getColor(guild.id) : '#0099ff');

    if (keywords.length > 0) {
        keywords.forEach(k => {
            let reactionText = '';
            if (k.reaction) {
                reactionText = k.reaction.isCustom 
                    ? `Réaction: <:${k.reaction.name}:${k.reaction.id}>`
                    : `Réaction: ${k.reaction.name}`;
            }
            embed.addFields({
                name: `📝 ${k.keyword}`,
                value: `Type: ${k.isEmbed ? 'Embed' : 'Message'}\n${reactionText}`,
                inline: true
            });
        });
    }

    return embed;
};

// Crée l'embed de configuration
const createConfigEmbed = (config) => {
    const embed = new EmbedBuilder()
        .setTitle('Configuration du mot-clé')
        .setDescription('Configurez votre nouveau mot-clé en utilisant les boutons ci-dessous.')
        .setColor('#00ff99');

    // Ajouter les configurations actuelles si elles existent
    if (config) {
        const fields = [];
        
        // Ajout du mot-clé s'il existe
        if (config.keyword) {
            fields.push({ name: 'Mot-clé', value: config.keyword, inline: true });
        }

        // Ajout du type
        fields.push({ 
            name: 'Type', 
            value: config.type || 'Message', 
            inline: true 
        });

        // Gestion de la réaction
        if (config.reaction) {
            fields.push({ 
                name: 'Réaction', 
                value: config.reaction.isCustom 
                    ? `<:${config.reaction.name}:${config.reaction.id}>`
                    : config.reaction.name,
                inline: true 
            });
        }

        // Fields spécifiques à l'embed
        if (config.type === 'Embed') {
            if (config.title) fields.push({ name: 'Titre', value: config.title, inline: true });
            if (config.description) fields.push({ name: 'Description', value: config.description, inline: true });
            if (config.color) fields.push({ name: 'Couleur', value: config.color, inline: true });
            if (config.footer) fields.push({ name: 'Footer', value: config.footer, inline: true });
            if (config.hasTimestamp !== undefined) {
                fields.push({ 
                    name: 'Timestamp', 
                    value: config.hasTimestamp ? 'Activé' : 'Désactivé', 
                    inline: true 
                });
            }
        } else if (config.type === 'Message' && config.message) {
            // Affichage du message pour le type Message
            fields.push({ name: 'Message', value: config.message, inline: true });
        }
        
        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Ajout du footer si présent et si c'est un embed
        if (config.footer && config.type === 'Embed') {
            embed.setFooter({ text: config.footer });
        }
    }

    return embed;
};

const updateButtons = (config, isEditing = false) => {
    const buttons1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('keyword-set-keyword')
                .setLabel('Mot-clé')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('keyword-toggle-type')
                .setLabel((config.type || 'Message'))
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('keyword-set-reaction')
                .setLabel('Réaction')
                .setStyle(ButtonStyle.Primary)
        );

    const buttons2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('keyword-set-title')
                .setLabel('Titre')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!config.isEmbed),
            new ButtonBuilder()
                .setCustomId('keyword-set-description')
                .setLabel('Description/Message')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('keyword-set-color')
                .setLabel('Couleur')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!config.isEmbed)
        );

    const buttons3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('keyword-set-footer')
                .setLabel('Footer')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!config.isEmbed),
            new ButtonBuilder()
                .setCustomId('keyword-toggle-timestamp')
                .setLabel('Timestamp')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(!config.isEmbed)
        );

    const buttons4 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('keyword-save')
                .setLabel('Sauvegarder')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('keyword-cancel')
                .setLabel('Annuler')
                .setStyle(ButtonStyle.Danger)
        );

    if (isEditing) {
        buttons4.addComponents(
            new ButtonBuilder()
                .setCustomId('keyword-delete')
                .setLabel('Supprimer')
                .setStyle(ButtonStyle.Danger)
        );
    }

    return [buttons1, buttons2, buttons3, buttons4];
};

module.exports = {
    name: 'keyword',
    loadKeywords, // Exporter pour messageCreate.js

    async execute(message, args) {
        const keywords = await loadKeywords();
        const embed = createMainEmbed(keywords, message.guild);
        
        // Création du menu de sélection
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('keyword-select')
                    .setPlaceholder('Sélectionnez une option')
                    .addOptions([
                        {
                            label: '➕ Créer une option',
                            description: '👉 Créer un nouveau mot-clé',
                            value: 'create'
                        },
                        ...keywords.map(k => ({
                            label: k.keyword,
                            description: 'Voir/Modifier ce mot-clé',
                            value: k.keyword
                        }))
                    ])
            );
    
        await message.reply({ embeds: [embed], components: [row] });
    },

    async handleInteraction(interaction) {
        if (interaction.isStringSelectMenu() && interaction.customId === 'keyword-select') {
            const keywords = await loadKeywords();
            
            if (interaction.values[0] === 'create') {
                const config = { 
                    type: 'Message',
                    isEmbed: false, 
                    hasTimestamp: false 
                };
                const embed = createConfigEmbed(config);
                const buttons = updateButtons(config, false); // Ajout de config
                
                await interaction.update({ embeds: [embed], components: buttons });
                interaction.client.keywordConfig = interaction.client.keywordConfig || new Map();
                interaction.client.keywordConfig.set(interaction.user.id, config);
            } else {
                // Chargement du mot-clé existant
                const selectedKeyword = keywords.find(k => k.keyword === interaction.values[0]);
                if (selectedKeyword) {
                    const embed = createConfigEmbed(selectedKeyword);
                    const buttons = updateButtons(selectedKeyword, true); // Ajout de selectedKeyword
                    
                    await interaction.update({ embeds: [embed], components: buttons });
                    interaction.client.keywordConfig = interaction.client.keywordConfig || new Map();
                    interaction.client.keywordConfig.set(interaction.user.id, selectedKeyword);
                }
            }
            return;
        }

        // Gestionnaire pour les boutons
        if (interaction.isButton()) {
            if (!interaction.client.keywordConfig) {
                interaction.client.keywordConfig = new Map();
            }

            let config = interaction.client.keywordConfig.get(interaction.user.id) || {
                isEmbed: false,
                hasTimestamp: false
            };

            switch (interaction.customId) {
                case 'keyword-toggle-type':
                    // Rotation entre les types : Message -> Embed -> Réaction -> Message
                    const types = ['Message', 'Embed', 'Réaction'];
                    const currentTypeIndex = types.indexOf(config.type || 'Message');
                    const nextTypeIndex = (currentTypeIndex + 1) % types.length;
                    config.type = types[nextTypeIndex];
                    
                    // Mise à jour des états en fonction du type
                    config.isEmbed = config.type === 'Embed';
                    
                    interaction.client.keywordConfig.set(interaction.user.id, config);
                    await interaction.update({ 
                        embeds: [createConfigEmbed(config)],
                        components: updateButtons(config, false)
                    });
                    break;

                case 'keyword-set-keyword':
                    await interaction.reply({ content: 'Veuillez entrer le mot-clé :', ephemeral: true });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        config.keyword = collected.first().content;
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        await collected.first().delete().catch(() => {});
                        await interaction.editReply({ content: 'Mot-clé enregistré !', ephemeral: true });
                        await interaction.message.edit({
                            embeds: [createConfigEmbed(config)],
                            components: updateButtons(config.isEmbed)
                        });
                    } catch (error) {
                        await interaction.editReply({ content: 'Temps écoulé, veuillez réessayer.', ephemeral: true });
                    }
                    break;

                case 'keyword-set-reaction':
                    await interaction.reply({ content: 'Veuillez envoyer l\'emoji souhaité :', ephemeral: true });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        const emojiMessage = collected.first();
                        // Regex pour détecter les emojis personnalisés et standards
                        const customEmojiRegex = /<:(.*)?:(\d+)>/;
                        const match = emojiMessage.content.match(customEmojiRegex);
                        
                        if (match) {
                            // Emoji personnalisé
                            config.reaction = {
                                id: match[2],
                                name: match[1],
                                isCustom: true
                            };
                        } else {
                            // Emoji standard
                            config.reaction = {
                                name: emojiMessage.content,
                                isCustom: false
                            };
                        }
                
                        await emojiMessage.delete().catch(() => {});
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        
                        await interaction.editReply({ content: 'Réaction enregistrée !', ephemeral: true });
                        await interaction.message.edit({
                            embeds: [createConfigEmbed(config)],
                            components: updateButtons(config, false) // Changé true en false
                        });
                        break;
                    } catch (error) {
                        console.error('Erreur lors de la configuration de la réaction:', error);
                        await interaction.editReply({ 
                            content: 'Temps écoulé ou erreur, veuillez réessayer.', 
                            ephemeral: true 
                        });
                    }
                    break;

                case 'keyword-set-description':
                    await interaction.reply({ 
                        content: config.isEmbed ? 'Veuillez entrer la description de l\'embed :' : 'Veuillez entrer le message :', 
                        ephemeral: true 
                    });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        if (config.isEmbed) {
                            config.description = collected.first().content;
                        } else {
                            config.message = collected.first().content;
                        }
                        
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        await collected.first().delete().catch(() => {});
                        await interaction.editReply({ 
                            content: config.isEmbed ? 'Description enregistrée !' : 'Message enregistré !',
                            ephemeral: true 
                        });
                        await interaction.message.edit({
                            embeds: [createConfigEmbed(config)],
                            components: updateButtons(config.isEmbed)
                        });
                    } catch (error) {
                        await interaction.editReply({ content: 'Temps écoulé, veuillez réessayer.', ephemeral: true });
                    }
                    break;

                case 'keyword-set-title':
                    if (!config.isEmbed) return;
                    await interaction.reply({ content: 'Veuillez entrer le titre de l\'embed :', ephemeral: true });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        config.title = collected.first().content;
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        await collected.first().delete().catch(() => {});
                        await interaction.editReply({ content: 'Titre enregistré !', ephemeral: true });
                        await interaction.message.edit({
                            embeds: [createConfigEmbed(config)],
                            components: updateButtons(config.isEmbed)
                        });
                    } catch (error) {
                        await interaction.editReply({ content: 'Temps écoulé, veuillez réessayer.', ephemeral: true });
                    }
                    break;

                case 'keyword-set-color':
                    if (!config.isEmbed) return;
                    await interaction.reply({ content: 'Veuillez entrer la couleur en format hexadécimal (ex: #ff0000) :', ephemeral: true });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id && /^#[0-9A-Fa-f]{6}$/.test(m.content),
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        config.color = collected.first().content;
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        await collected.first().delete().catch(() => {});
                        await interaction.editReply({ content: 'Couleur enregistrée !', ephemeral: true });
                        await interaction.message.edit({
                            embeds: [createConfigEmbed(config)],
                            components: updateButtons(config.isEmbed)
                        });
                    } catch (error) {
                        await interaction.editReply({ content: 'Temps écoulé ou format invalide, veuillez réessayer.', ephemeral: true });
                    }
                    break;

                case 'keyword-set-footer':
                    if (!config.isEmbed) return;
                    await interaction.reply({ content: 'Veuillez entrer le footer de l\'embed :', ephemeral: true });
                    try {
                        const collected = await interaction.channel.awaitMessages({
                            filter: m => m.author.id === interaction.user.id,
                            max: 1,
                            time: 30000,
                            errors: ['time']
                        });
                        
                        config.footer = collected.first().content;
                        interaction.client.keywordConfig.set(interaction.user.id, config);
                        await collected.first().delete().catch(() => {});
                        
                        await interaction.editReply({ 
                            content: 'Footer enregistré !', 
                            ephemeral: true 
                        });
                        
                        // Mettre à jour l'embed principal
                        const updatedEmbed = createConfigEmbed(config);
                        await interaction.message.edit({
                            embeds: [updatedEmbed],
                            components: updateButtons(config.isEmbed)
                        });
                    } catch (error) {
                        console.error('Erreur lors de la configuration du footer:', error);
                        await interaction.editReply({ 
                            content: 'Temps écoulé, veuillez réessayer.', 
                            ephemeral: true 
                        });
                    }
                    break;

                case 'keyword-toggle-timestamp':
                    if (!config.isEmbed) return;
                    config.hasTimestamp = !config.hasTimestamp;
                    interaction.client.keywordConfig.set(interaction.user.id, config);
                    await interaction.update({
                        embeds: [createConfigEmbed(config)],
                        components: updateButtons(config.isEmbed)
                    });
                    break;
                //
                case 'keyword-save':
                    // Vérifications des champs requis
                    if (!config.keyword) {
                        await interaction.reply({
                            content: '❌ Vous devez définir un mot-clé !',
                            ephemeral: true
                        });
                        return;
                    }
                
                    // Vérification en fonction du type
                    switch(config.type) {
                        case 'Message':
                            if (!config.message) {
                                await interaction.reply({
                                    content: '❌ Vous devez définir un message !',
                                    ephemeral: true
                                });
                                return;
                            }
                            break;
                        case 'Embed':
                            if (!config.description) {
                                await interaction.reply({
                                    content: '❌ Vous devez définir une description !',
                                    ephemeral: true
                                });
                                return;
                            }
                            break;
                        case 'Réaction':
                            if (!config.reaction) {
                                await interaction.reply({
                                    content: '❌ Vous devez définir une réaction !',
                                    ephemeral: true
                                });
                                return;
                            }
                            break;
                    }

                    try {
                        const keywords = await loadKeywords();
                        
                        // Vérifier si le mot-clé existe déjà
                        const existingIndex = keywords.findIndex(k => k.keyword.toLowerCase() === config.keyword.toLowerCase());
                        if (existingIndex !== -1) {
                            // Mettre à jour le mot-clé existant
                            keywords[existingIndex] = config;
                        } else {
                            // Ajouter le nouveau mot-clé
                            keywords.push(config);
                        }

                        await saveKeywords(keywords);
                        interaction.client.keywordConfig.delete(interaction.user.id);

                        // Retourner au menu principal
                        const mainEmbed = createMainEmbed(keywords, interaction.guild);
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('keyword-select')
                                    .setPlaceholder('Sélectionnez une option')
                                    .addOptions([
                                        {
                                            label: 'Créer une option',
                                            description: 'Créer un nouveau mot-clé',
                                            value: 'create'
                                        },
                                        ...keywords.map(k => ({
                                            label: k.keyword,
                                            description: 'Voir/Modifier ce mot-clé',
                                            value: k.keyword
                                        }))
                                    ])
                            );

                        await interaction.update({
                            embeds: [mainEmbed],
                            components: [row]
                        });

                        await interaction.followUp({
                            content: '✅ Mot-clé sauvegardé avec succès !',
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Erreur lors de la sauvegarde:', error);
                        await interaction.reply({
                            content: '❌ Une erreur est survenue lors de la sauvegarde.',
                            ephemeral: true
                        });
                    }
                    break;

                case 'keyword-cancel':
                    try {
                        // Supprimer la configuration temporaire
                        interaction.client.keywordConfig.delete(interaction.user.id);

                        // Retourner au menu principal
                        const keywords = await loadKeywords();
                        const mainEmbed = createMainEmbed(keywords, interaction.guild);
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('keyword-select')
                                    .setPlaceholder('Sélectionnez une option')
                                    .addOptions([
                                        {
                                            label: 'Créer une option',
                                            description: 'Créer un nouveau mot-clé',
                                            value: 'create'
                                        },
                                        ...keywords.map(k => ({
                                            label: k.keyword,
                                            description: 'Voir/Modifier ce mot-clé',
                                            value: k.keyword
                                        }))
                                    ])
                            );

                        await interaction.update({
                            embeds: [mainEmbed],
                            components: [row]
                        });

                        await interaction.followUp({
                            content: '✅ Configuration annulée.',
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('Erreur lors de l\'annulation:', error);
                        await interaction.reply({
                            content: '❌ Une erreur est survenue lors de l\'annulation.',
                            ephemeral: true
                        });
                    }
                    break;

                case 'keyword-delete':
                    try {
                        const keywords = await loadKeywords();
                        const updatedKeywords = keywords.filter(k => k.keyword.toLowerCase() !== config.keyword.toLowerCase());
                        await saveKeywords(updatedKeywords);
                        
                        // Retourner au menu principal
                        const mainEmbed = createMainEmbed(keywords, interaction.guild);
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new StringSelectMenuBuilder()
                                    .setCustomId('keyword-select')
                                    .setPlaceholder('Sélectionnez une option')
                                    .addOptions([
                                        {
                                            label: '➕ Créer une option',
                                            description: '👉 Créer un nouveau mot-clé',
                                            value: 'create'
                                        },
                                        ...updatedKeywords.map(k => ({
                                            label: k.keyword,
                                            description: 'Voir/Modifier ce mot-clé',
                                            value: k.keyword
                                        }))
                                    ])
                            );

                        await interaction.update({
                            embeds: [mainEmbed],
                            components: [row]
                        });

                        await interaction.followUp({
                            content: '✅ Mot-clé supprimé avec succès !',
                            ephemeral: true
                        });

                        interaction.client.keywordConfig.delete(interaction.user.id);
                    } catch (error) {
                        console.error('Erreur lors de la suppression:', error);
                        await interaction.reply({
                            content: '❌ Une erreur est survenue lors de la suppression.',
                            ephemeral: true
                        });
                    }
                    break;
            }
        }
    }
}
