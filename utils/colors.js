const fs = require('fs');
const path = require('path');

class ColorManager {
    constructor() {
        this.configPath = path.join(__dirname, '../data/color/serverColors.json');
        this.colors = this.loadColors();
    }

    loadColors() {
        try {
            if (fs.existsSync(this.configPath)) {
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            }
            this.saveColors({});
            return {};
        } catch (error) {
            console.error('Erreur lors du chargement des couleurs:', error);
            return {};
        }
    }

    saveColors(colors = this.colors) {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(colors, null, 2));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des couleurs:', error);
        }
    }

    initServer(serverId) {
        if (!this.colors[serverId]) {
            this.colors[serverId] = {
                default: '#ffffff',
                current: '#ffffff' 
            };
            this.saveColors();
        }
    }

    setColor(serverId, color) {
        this.initServer(serverId);
        this.colors[serverId].current = color;
        this.saveColors();
    }

    getColor(serverId) {
        this.initServer(serverId);
        return this.colors[serverId].current;
    }

    getDefaultColor(serverId) {
        this.initServer(serverId);
        return this.colors[serverId].default;
    }
}

const colorManager = new ColorManager();
module.exports = colorManager;