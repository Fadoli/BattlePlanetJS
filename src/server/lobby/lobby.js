const Client = require('../client').Client;
const util = require("../../utils");

/**
 * This class handles the lobby : players first join a lobby before being in a game
 * @export
 * @class Lobby
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
     * @param {Client} player
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
}

module.exports = {
    Lobby
}
