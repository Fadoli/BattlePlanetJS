const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const static = require('./static');
const clientManager = require('./clientManager');

// Listen on port 1888
server.listen(1888);

// Serve static contents
static.init(app);

// Handle loby and game communication
clientManager.init(io);
