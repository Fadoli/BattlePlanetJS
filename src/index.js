const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const fs = require('fs');

app.listen(1888);

// This decides where the script is on the hard-drive !
let scriptPath = __dirname + '/client/_script.js';
if ( !fs.existsSync(scriptPath) )
{
    scriptPath = __dirname + '/client/_script.min.js';
    if ( !fs.existsSync(scriptPath) )
    {
        console.log("Please build your project !");
        return 1;
    }
}
console.log('Path for script it : ' + scriptPath)
app.get('/main.js', function (req, res) {
    res.sendFile(scriptPath);
});

app.get('/*', function (req, res) {
    const data = {
        url: req.originalUrl,
        query: req.query,
        params: req.params,
    }
    if ( data.url.includes('..') ) {
        res.status(404).send();
    } else {
        res.sendFile(__dirname + '/client' + data.url);
    }
});

io.on('connection', function (socket) {
    socket.emit('news', { hello: 'world' });
    socket.on('my other event', function (data) {
        console.log(data);
    });
});