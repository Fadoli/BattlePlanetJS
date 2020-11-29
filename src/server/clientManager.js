const Client = require("./client").Client;
const GameManager = require("./game/gameManager").GameManager;
const LobbyManager = require('./lobby');
const util = require("../utils");

function log(str) {
    console.log("[CLIENT MANAGER] : " + str);
}

function notifyUserInLoby(cb) {
    const users = Client.getUserInServerList();
    for (const user of users) {
        cb(user)
    }
}

/**
 * @description
 * @param {Client} user 
 */
function userLeaveLobby (user) {
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
                    userLeaveLobby(user);
                    return;
                }
                try {
                    const display = `${user.name} : ${msg}`;
                    log(display);
                    if (user.isInLobby()) {
                        user.lobby.sendChat(display);
                    } else {
                        notifyUserInLoby((anotherUser) => anotherUser.sendChat(display));
                    }
                } catch (e) {
                    log("FAILED chat : " + e)
                }
            });

            socket.on('lobbyCreate', function (opts) {
                try {
                    LobbyManager.create()
                    const game = GameManager.createLobby(user, opts.name, opts.game)
                    user.moveToServerList(game);
                    notifyUserInLoby((anotherUser) => anotherUser.notifyNewLobby(game));
                } catch (e) {
                    log("FAILED lobbyCreate : " + e)
                }
            });
            socket.on('lobbyListJoin', function (gameData) {
                try {
                    const game = GameManager.getLobby(gameData.uuid);
                    user.moveToLobby(game);
                } catch (e) {
                    log("FAILED lobbyListJoin : " + e)
                }
            });

            socket.on('lobbyLeave', function (opts) {
                userLeaveLobby(user);
            });
            socket.on('lobbyUpdate', function (msg) {
                log('message: ' + msg);
            });
        });
    }

}