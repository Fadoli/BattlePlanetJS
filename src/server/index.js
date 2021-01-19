const express = require('express');
const path = require('path');

const staticPages = require('./static');
const clientManager = require('./clientManager');
const gameRegistry = require('./gameRegistry');

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

module.exports = {
    start: () => {
        // Listen on port 1888
        server.listen(1888);

        // Serve static contents
        staticPages.init(app);

        // Handle loby and game communication
        clientManager.init(io);
        gameRegistry.empty();
        gameRegistry.init(path.join(__dirname,'../games'))
    }
}