const Client = require("./client").Client;
const GameManager = require("../game/gameManager").GameManager;
const util = require("../utils");

const players = {};
const games = {};

function log() {
    console.log(arguments);
}

function notifyUserInLoby ( msg ) {
    getUserInLoby()
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
            socket.on('create', function ( opts ) {
                new GameManager(user, opts.name)
                user.moveToGame(games[uuid]);
            });
            socket.on('chat', function (msg) {
                log('chat: ' + msg);
                notifyUserInLoby(msg);
            });


            socket.on('gameLeave', function ( opts ) {
                user.moveToLoby();
            });
            socket.on('gameChat', function (msg) {
                user.game.chat(msg);
            });
            socket.on('gameUpdate', function (msg) {
                log('message: ' + msg);
            });
        });
    }

}