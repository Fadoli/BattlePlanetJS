

/**
* @typedef {Object} GameData
* @property {string} name
* @property {function} constructor
* @property {function} client
* @property {number} minPlayer
* @property {number} maxPlayer
* @property {Object} configurableOptions
* @property {number} configurableOptions.maxPlayer
*/
/**
* @typedef {Object} GameOptions
* @property {string} name
* @property {Object} configurableOptions
* @property {number} configurableOptions.maxPlayer
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
        games[name] = gameData;
    },
    /**
     * Create a game for a given lobby
     * @param {*} lobby
     * @param {GameOptions} gameOptions
     */
    createGame(gameOptions) {
        return games[gameOptions.name].constructor(gameOptions.configurableOptions);
    }
}