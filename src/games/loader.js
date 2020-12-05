const fs = require('fs');
const path = require('path');

const gameRegistry = require("../server/gameRegistry");

/**
* @typedef {Object} GameData
* @property {string} name the name of the game
* @property {function} server the server creating logic
* @property {string} client the client code
* @property {number} minPlayer the minimal player count
* @property {number} maxPlayer the maximum player count
* @property {Object} options options for the underlying game server
*/

const dir = __dirname;
const files = fs.readdirSync(dir, {withFileTypes: true});
//console.log(files);
files.forEach((file) => {
    if ( file.isDirectory() ) {
        const name = file.name;
        const dirPath = path.join(dir,name);
        const config = JSON.parse(fs.readFileSync(path.join(dirPath,'data.json'), {encoding: 'utf-8'}));
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
            ...config
        };
        console.log(JSON.stringify(gameData,null,4));
        gameRegistry.registerGame(gameData);
    }
})
