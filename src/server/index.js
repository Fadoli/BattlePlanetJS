const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const staticPages = require('./static');
const clientManager = require('./clientManager');



module.exports = {
    start: () => {
        // Listen on port 1888
        server.listen(1888);

        // Serve static contents
        staticPages.init(app);

        // Handle loby and game communication
        clientManager.init(io);
    }
}