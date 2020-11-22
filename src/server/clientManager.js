const Client = require("./client").Client;
const GameManager = require("./game/gameManager").GameManager;
const util = require("../utils");

function log(str) {
    console.log("[CLIENT MANAGER] : " + str);
}

function notifyUserInLoby(cb) {
    const users = Client.getUserInLoby();
    for (const user of users) {
        cb(user)
    }
}

function userLeaveGame (user) {
    const res = user.moveToLobby();
    if (res) {
        notifyUserInLoby((usr) => usr.notifyEndLobbyGame(res))
    }
}

module.exports = {

    init(io) {
        io.on('connection', function (socket) {
            const user = new Client(socket);
            socket.on('setToken', function (msg) {
                const uuid = msg.uuid;

                log('Client connecting with token : ' + uuid);
                user.register(uuid, msg.username);
            });
            socket.on('getToken', function () {
                const uuid = util.uuidv4();

                log('Client connecting with no token, will be using : ' + uuid);
                user.register(uuid);
            });

            // Mixed ingame and inlobby
            socket.on('chat', function (msg) {
                if (!user.token || !user.name) {
                    // We don't want to do anything
                    socket.emit('error', 'not connected');
                    return;
                }
                if (msg === '/leave') {
                    userLeaveGame(user);
                    return;
                }
                try {
                    const display = `${user.name} : ${msg}`;
                    log(display);
                    if (user.isInGame()) {
                        user.game.sendChat(display);
                    } else {
                        notifyUserInLoby((anotherUser) => anotherUser.sendChat(display));
                    }
                } catch (e) {
                    log("FAILED chat : " + e)
                }
            });

            socket.on('gameCreate', function (opts) {
                try {
                    const game = GameManager.createGame(user, opts.name, opts.game)
                    user.moveToGame(game);
                    notifyUserInLoby((anotherUser) => anotherUser.notifyNewLobbyGame(game));
                } catch (e) {
                    log("FAILED gameCreate : " + e)
                }
            });
            socket.on('gameJoin', function (gameData) {
                try {
                    const game = GameManager.getGame(gameData.uuid);
                    user.moveToGame(game);
                } catch (e) {
                    log("FAILED gameJoin : " + e)
                }
            });

            socket.on('gameLeave', function (opts) {
                userLeaveGame(user);
            });
            socket.on('gameUpdate', function (msg) {
                log('message: ' + msg);
            });
        });
    }

}