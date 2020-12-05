

/**
* @typedef {Object} GameData
* @property {string} name the name of the game
* @property {function} server the server creating logic
* @property {string} client the client code
* @property {number} minPlayer the minimal player count
* @property {number} maxPlayer the maximum player count
* @property {Object} options options for the underlying game server
*/
/**
* @typedef {Object} GameOptions
* @property {string} name
* @property {Object} options
* @property {number} options.maxPlayer
*/

/**
 * @type {Object.<string,GameData>}
 */
const games = {};
module.exports = {
    gamesList() {
        return games;
    },
    /**
     * Register a game to the game mechanism
     * @param {GameData} gameData
     */
    registerGame(gameData) {
        games[gameData.name] = gameData;
    },
    /**
     * Create a game for a given lobby
     * @param {*} lobby
     * @param {GameOptions} gameOptions
     */
    createGame(gameOptions) {
        return games[gameOptions.name].server(gameOptions.options);
    }
}