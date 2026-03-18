const Client = require('../client').Client;
const util = require("../../utils");
const BattlePlanetGame = require("../../games/BattlePlanet/server");

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
    constructor({owner, name, settings, onLobbyEnd, OnLobbyEnd} = {}) {
        this.owner = owner;
        this.uuid = util.uuidv4();
        this.name = name;
        this.settings = settings || {};
        this.onLobbyEnd = onLobbyEnd || OnLobbyEnd;
        this.tick = undefined;

        /** 
         * @type {Object.<string,Client>}
         */
        this.players = {};
        this.game = new BattlePlanetGame({
            name,
            settings: this.settings,
        });
        this.addPlayer(owner);
    }

    /**
     * Add a player to the game
     * @param {Client} player
     * @memberof Lobby
     */
    addPlayer(player) {
        if (this.players[player.token]) {
            return;
        }
        this.players[player.token] = player;
        this.game.addPlayer(player);
    }

    /**
     * Remove a player to the game
     * @param {Client} player
     * @memberof Lobby
     */
    removePlayer(player) {
        delete this.players[player.token];
        this.game.removePlayer(player);
        if (this.playerCount() === 0) {
            if (this.onLobbyEnd) {
                this.game.stop();
                this.onLobbyEnd(this);
            } else {
                console.log("OnLobbyEnd undefined !");
            }
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

    handleGameInput(player, payload) {
        this.game.handleInput(player, payload);
    }
}

module.exports = {
    Lobby
}
