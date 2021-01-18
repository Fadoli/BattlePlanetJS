const fs = require('fs');
const path = require('path');

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
* @property {number} options.minPlayer
* @property {number} options.maxPlayer
*/

function requireUncached(module) {
    delete require.cache[require.resolve(module)];
    return require(module);
}

/**
 * @type {Object.<string,GameData>}
 */
let games = {};
module.exports = {
    /**
     * Returns the list of all games
     * @returns {Object.<string,GameData>}
     */
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
        const game = games[gameOptions.name];
        if (!game) {
            throw new Error(`${gameOptions.name} is not a valid game name !`);
        }
        if (typeof(game.server) !== 'function') {
            throw new Error(`${gameOptions.name} is invalid !`);
        }
        return new game.server(gameOptions.options);
    },
    empty() {
        games = {};
    },
    /**
     * Loads (or re-load) all element in the directory
     * @param {string} dir
     */
    init(dir) {
        const files = fs.readdirSync(dir, {withFileTypes: true});
        //console.log(files);
        files.forEach((file) => {
            if ( file.isDirectory() ) {
                const name = file.name;
                const dirPath = path.join(dir,name);
                let config = {};
                try {
                    config = JSON.parse(fs.readFileSync(path.join(dirPath,'data.json'), {encoding: 'utf-8'}))
                } catch (e) {
                    // ...
                }
                let client = '404 not found !';
                try {
                    client = fs.readFileSync(path.join(dirPath,'client.js'), {encoding: 'utf-8'});
                } catch (e) {
                    // ...
                }

                /**
                 * @type GameData
                 */
                const gameData = {
                    name: name,
                    path: dirPath,
                    client: client,
                    server: requireUncached(path.join(dirPath,'server.js')),
                    ...config
                };
                this.registerGame(gameData);
            }
        });
    }
}