const Client = require('../../server/client').Client;
const util = require("../../utils");

const objectTool = require('./src/physicalObject');

const Map = require('./src/world').Map;
const games = {};

// Controll the expected tick-rates of the game
const ticksPerSeconds = 40;
const tickRate = 1000/ticksPerSeconds;

/**
 * Describe the class that handle the map and players
 * @export
 * @class gameManager
 */
class GameManager {

    /**
     * Creates an instance of GameManager.
     * @param {Client} owner
     * @param {string} name
     * @memberof GameManager
     */
    constructor(owner, name) {
        this.owner = owner;
        this.uuid = util.uuidv4();
        this.name = name;
        this.tick = undefined;

        /** 
         * @type {Object.<string,Client>}
         */
        this.players = {};
        this.addPlayer(owner);
    }


    /**
     * Start the tick interval, and create the map for the players :)
     * @memberof GameManager
     */
    start() {
        const mapSize = 600 + 100 * players.length;
        this.map = new Map(mapSize);
        this.tick = setInterval(() => this.map.tick(), tickRate)
    }

    /**
     * Cleanup the tick interval
     * @memberof GameManager
     */
    stop () {
        clearInterval(this.tick);
        this.tick = undefined;
    }

    isInLobby() {
        return !this.tick;
    }

    /**
     * Add a player to the game
     * @memberof GameManager
     */
    addPlayer(player) {
        this.players[player.token] = player;
    }

    /**
     * Remove a player to the game
     * @param {Client} player
     * @memberof GameManager
     */
    removePlayer(player) {
        delete this.players[player.token];
        if (this.playerCount() === 0) {
            GameManager.stopGame(this);
            return this;
        }
    }

    /**
     * return the number of player
     * @returns {number}
     * @memberof GameManager
     */
    playerCount() {
        return Object.keys(this.players).length;
    }

    /**
     *
     * @static
     * @memberof GameManager
     */
    sendChat (msg) {
        const players = Object.values(this.players);
        for (const player of players) {
            player.sendChat(msg);
        }
    }
    /**
     * Stop a server
     * @static
     * @param {GameManager} game
     * @memberof GameManager
     */
    static stopGame (game) {
        game.stop();
        delete games[game.uuid];
    }
    /**
     * Create a game
     * @static
     * @returns {GameManager}
     * @memberof GameManager
     */
    static createGame(owner, name, gameOptions) {
        const newGame = new GameManager(owner, name);
        games[newGame.uuid] = newGame;
        return newGame;
    }
    /**
     * Get a specific game
     * @static
     * @returns {GameManager}
     * @memberof GameManager
     */
    static getGame(uuid) {
        return games[uuid];
    }
    /**
     * Get all the current games
     * @static
     * @returns {Array<GameManager>}
     * @memberof GameManager
     */
    static getGames() {
        return Object.values(games);
    }
}

module.exports = {
    GameManager: GameManager,
}
