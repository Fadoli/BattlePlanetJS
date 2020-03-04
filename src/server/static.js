const fs = require('fs');


module.exports = {

    init(app) {
        // This decides where the script is on the hard-drive !
        let scriptPath = __dirname + '/client/_script.js';
        if (!fs.existsSync(scriptPath)) {
            scriptPath = __dirname + '/client/_script.min.js';
            if (!fs.existsSync(scriptPath)) {
                console.log("Please build your project !");
                return 1;
            }
        }
        console.log('Path for script it : ' + scriptPath)
        app.get('/main.js', function (req, res) {
            res.sendFile(scriptPath);
        });

        app.get('/', function (req, res) {
            res.sendFile(__dirname + '/client/index.html');
        });
        app.get('/res/*', function (req, res) {
            const data = {
                url: req.originalUrl,
                query: req.query,
                params: req.params,
            }
            if (data.url.includes('..')) {
                res.status(404).send();
            } else {
                res.sendFile(__dirname + '/client' + data.url);
            }
        });
    }
}

