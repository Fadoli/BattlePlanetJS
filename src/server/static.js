const fs = require('fs');
const path = require('path');
const gameRegistry = require('./gameRegistry');

const log = console.log;

let dir = __dirname;
if ( dir.endsWith("server") ) {
    dir = path.dirname(dir);
}
dir = path.join(dir, 'client');



function reportMissingFile ( filepath ) {
    log(`Could not find file at ${filepath}`);
}
function getLocalFile (req,res)  {
    const data = {
        url: req.originalUrl,
        query: req.query,
        params: req.params,
    }
    if (data.url.includes('..')) {
        res.status(404).send();
    } else {
        res.sendFile(dir + data.url);
    }
};
function getGameClient (req,res)  {
    const data = {
        game: req.originalUrl.split('/game/')[1],
        query: req.query,
        params: req.params,
    }
    if (data.game.includes('..')) {
        res.status(404).send();
    } else {
        res.send(gameRegistry.gamesList()[data.game])
        res.sendFile(dir + data.url);
    }
};

module.exports = {
    
    init(app) {
        
        
        /*
        // This decides where the script is on the hard-drive !
        let scriptPath = path.join(dir, 'client', 'scripts.compiled.js');
        if (!fs.existsSync(scriptPath)) {
            reportMissingFile(scriptPath);
            scriptPath = path.join(dir, 'client', 'scripts.compiled.js');
            if (!fs.existsSync(scriptPath)) {
                reportMissingFile(scriptPath);
                log("Could not find client binary, please built your project !");
                return 1;
            }
        }
        console.log('Path for script it : ' + scriptPath)
        app.get('/main.js', function (req, res) {
            res.sendFile(scriptPath);
        });
        */
        
        app.get('/', function(req,res) {
            res.sendFile(path.join(dir,"index.html"));
        });
        app.get('/game/*', getGameClient);
        app.get('/src/*', getLocalFile);
        app.get('/res/*', getLocalFile);
        app.get('/lib/*', getLocalFile);
    }
}

