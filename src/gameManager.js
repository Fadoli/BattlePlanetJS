const Map = require('./world').Map;
const objectTool = require('./lib/physicalObject');

/**
 * Describe the class that handle the map and players
 * @export
 * @class gameManager
 */
export default class gameManager {

    /**
     * Creates an instance of gameManager.
     * @param {Array<Player>} players
     * @memberof gameManager
     */
    constructor (players) {
        this.players = players;

        const mapSize = 600 + 100 * players.length;
        this.map = new Map(mapSize);
    }

    
}