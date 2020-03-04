import { Client } from '../server/client';
const util = require("../utils");

const objectTool = require('./lib/physicalObject');

const Map = require('./world').Map;
const games = {};

/**
 * Describe the class that handle the map and players
 * @export
 * @class gameManager
 */
export class GameManager {

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

        this.players = {};
        this.addPlayer(owner);
    }


    start() {
        const mapSize = 600 + 100 * players.length;
        this.map = new Map(mapSize);
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

    static stopGame (game) {
        delete games[game.uuid];
    }
    static createGame(owner, name) {
        const newGame = new GameManager(owner, name);
        games[newGame.uuid] = newGame;
        return newGame;
    }
    static getGame(uuid) {
        return games[uuid];
    }
    static getGames() {
        return Object.values(games);
    }
}