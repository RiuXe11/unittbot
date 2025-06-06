const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const path = require('path');
const colorManager = require(path.join(process.cwd(), 'utils', 'colors.js'));

module.exports = {
    name: 'set-color',
    description: 'Menu interactif pour définir la couleur des embeds',
    async execute(message) {
        const serverColor = colorManager.getColor(message.guild.id);
        const defaultColor = colorManager.getDefaultColor(message.guild.id);

        // Création de l'embed initial
        const colorEmbed = new EmbedBuilder()
            .setTitle('🎨 Personnalisation de la couleur')
            .setDescription('Cliquez sur "Choisir la couleur" pour définir une nouvelle couleur')
            .addFields(
                { name: 'Couleur actuelle', value: serverColor, inline: true },
                { name: 'Couleur par défaut', value: defaultColor, inline: true }
            )
            .setColor(serverColor)
            .setFooter({ text: 'Utilisez le format hexadécimal (ex: #FF0000)' });

        // Création des boutons
        const buttons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('choose_color')
                    .setLabel('Choisir la couleur')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎨'),
                new ButtonBuilder()
                    .setCustomId('send')
                    .setLabel('Envoyer')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('reset')
                    .setLabel('Réinitialiser')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('cancel')
                    .setLabel('Annuler')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        const menuMessage = await message.channel.send({
            embeds: [colorEmbed],
            components: [buttons]
        });

        const collector = menuMessage.createMessageComponentCollector({
            time: 300000
        });

        let currentColor = serverColor;
        let askingForColor = false;

        collector.on('collect', async (interaction) => {
            if (!interaction.isButton()) return;

            switch (interaction.customId) {
                case 'choose_color':
                    askingForColor = true;
                    await interaction.reply('Veuillez entrer un code couleur hexadécimal (ex: #FF0000):');
                    
                    const filter = m => m.author.id === message.author.id && 
                        (/^#[0-9A-Fa-f]{6}$/.test(m.content) || /^[0-9A-Fa-f]{6}$/.test(m.content));
                    
                    const colorCollector = message.channel.createMessageCollector({
                        filter,
                        max: 1,
                        time: 30000
                    });

                    colorCollector.on('collect', async (msg) => {
                        let newColor = msg.content;
                        if (!newColor.startsWith('#')) newColor = '#' + newColor;
                        
                        currentColor = newColor;
                        
                        colorEmbed
                            .setColor(newColor)
                            .spliceFields(0, 2, 
                                { name: 'Couleur actuelle', value: serverColor, inline: true },
                                { name: 'Couleur par défaut', value: defaultColor, inline: true },
                                { name: 'Nouvelle couleur', value: newColor, inline: true }
                            );
                        
                        await menuMessage.edit({ embeds: [colorEmbed] });
                        await msg.delete().catch(() => {});
                        await interaction.deleteReply().catch(() => {});
                        askingForColor = false;
                    });

                    colorCollector.on('end', (collected, reason) => {
                        if (reason === 'time' && askingForColor) {
                            interaction.editReply('Temps écoulé. Veuillez réessayer.').catch(() => {});
                            askingForColor = false;
                        }
                    });
                    break;

                case 'send':
                    colorManager.setColor(message.guild.id, currentColor);
                    
                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('✅ Couleur définie')
                        .setDescription(`La nouvelle couleur ${currentColor} a été appliquée.`)
                        .setColor(currentColor);
                    
                    await interaction.update({ 
                        embeds: [confirmEmbed], 
                        components: [] 
                    });
                    collector.stop();
                    break;

                case 'reset':
                    const defaultColorValue = colorManager.getDefaultColor(message.guild.id);
                    currentColor = defaultColorValue;
                    
                    colorEmbed
                        .setColor(defaultColorValue)
                        .spliceFields(0, 3,
                            { name: 'Couleur actuelle', value: serverColor, inline: true },
                            { name: 'Couleur par défaut', value: defaultColor, inline: true },
                            { name: 'Nouvelle couleur', value: defaultColorValue, inline: true }
                        );
                    
                    await interaction.update({ embeds: [colorEmbed] });
                    break;

                case 'cancel':
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Configuration annulée')
                        .setDescription('La personnalisation de la couleur a été annulée.')
                        .setColor('Red');
                    
                    await interaction.update({ 
                        embeds: [cancelEmbed], 
                        components: [] 
                    });
                    collector.stop();
                    break;
            }
        });

        collector.on('end', () => {
            if (menuMessage.editable) {
                menuMessage.edit({ 
                    components: [] 
                }).catch(() => {});
            }
        });
    },
};