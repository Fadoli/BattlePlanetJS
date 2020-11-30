const Client = require('../client').Client;
const util = require("../../utils");



/**
 * This class handles the lobby : players first join a lobby before being in a game
 * @export
 * @class gameManager
 */
class Lobby {
    /**
     * Creates an instance of LobyManager.
     * @param {Client} owner
     * @param {string} name
     * @memberof Lobby
     */
    constructor({owner, name, onLobbyEnd} = {}) {
        this.owner = owner;
        this.uuid = util.uuidv4();
        this.name = name;
        this.onLobbyEnd = onLobbyEnd;
        this.tick = undefined;

        /** 
         * @type {Object.<string,Client>}
         */
        this.players = {};
        this.addPlayer(owner);
    }

    /**
     * Add a player to the game
     * @memberof Lobby
     */
    addPlayer(player) {
        this.players[player.token] = player;
    }

    /**
     * Remove a player to the game
     * @param {Client} player
     * @memberof Lobby
     */
    removePlayer(player) {
        delete this.players[player.token];
        if (this.playerCount() === 0) {
            Lobby.stopLobby(this);
            return this;
        }
    }

    /**
     * return the number of player
     * @returns {number}
     * @memberof Lobby
     */
    playerCount() {
        return Object.keys(this.players).length;
    }

    /**
     * @description send a message to the whole lobby
     * @param {string} msg 
     * @memberof Lobby
     */
    sendChat (msg) {
        const players = Object.values(this.players);
        for (const player of players) {
            player.sendChat(msg);
        }
    }
    /**
     * @description Stop a server
     * @static
     * @param {Lobby} lobby
     * @memberof Lobby
     */
    static stopLobby (lobby) {
        // lobby.stop();
        this.onLobbyEnd(this);
    }
    /**
     * @description Create a lobby
     * @static
     * @returns {Lobby}
     * @memberof Lobby
     */
    static createLobby(owner, name, gameOptions) {
        const newGame = new Lobby(owner, name);
        games[newGame.uuid] = newGame;
        return newGame;
    }
    /**
     * @description Get a specific lobby
     * @static
     * @returns {Lobby}
     * @memberof Lobby
     */
    static getGame(uuid) {
        return games[uuid];
    }
    /**
     * Get all the current games
     * @static
     * @returns {Array<Lobby>}
     * @memberof Lobby
     */
    static getGames() {
        return Object.values(games);
    }
}

module.exports = {
    Lobby
}
