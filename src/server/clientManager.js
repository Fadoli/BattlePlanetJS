const Client = require("./client").Client;
const GameManager = require("../game/gameManager").GameManager;
const util = require("../utils");

function log(str) {
    console.log("[CLIENT MANAGER] : " + str);
}

function notifyUserInLoby(msg) {
    const users = Client.getUserInLoby();
    for (const user of users) {
        user.socket.emit('chat', msg);
    }
}

module.exports = {

    init(io) {
        io.on('connection', function (socket) {
            const user = new Client(socket);
            log("NEW CONNECTION !")
            socket.on('setToken', function (msg) {
                const uuid = msg.uuid;

                log('Client connecting with token : ' + uuid);
                user.register(uuid);
            });
            socket.on('getToken', function () {
                const uuid = util.uuidv4();
                log('Client connecting with no token, will be using : ' + uuid);
                socket.emit('setToken', {
                    uuid: uuid
                })
                user.register(uuid);
            });
            socket.on('create', function (opts) {
                const game = GameManager.createGame(user, opts.name)
                user.moveToGame(game);
            });
            socket.on('chat', function (msg) {
                log('chat: ' + msg);
                if (user.isInGame()) {
                    user.game.chat(msg);
                } else {
                    notifyUserInLoby(msg);
                }
            });


            socket.on('gameLeave', function (opts) {
                user.moveToLoby();
            });
            socket.on('gameUpdate', function (msg) {
                log('message: ' + msg);
            });
        });
    }

}