const Client = require("./client").Client;
const LobbyManager = require('./lobby');
const util = require("../utils");
const { createServerSocketAdapter } = require("./wsAdapter");

const AntiHijackDuration = 500;

function log(str) {
    console.log("[CLIENT MANAGER] : " + str);
}

function notifyUserInLobbyList(cb) {
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
    const res = user.moveToServerList();
    if (res) {
        notifyUserInLobbyList((usr) => usr.notifyEndLobbyGame(res))
    }
}

module.exports = {

    init(wss) {
        wss.on('connection', function (rawSocket, request) {
            const socket = createServerSocketAdapter(rawSocket, request);
            const user = new Client(socket);
            socket.on('setToken', function (msg) {
                const uuid = msg.uuid;

                const existingUser = Client.getUser(uuid);
                if (existingUser) {
                    const dif = Date.now() - existingUser.last
                    if (dif < AntiHijackDuration && existingUser.ip !== user.ip) {
                        let newUuid = util.uuidv4();
                        log(`Client trying to hijak the token ${uuid}, will be using : ` + newUuid);
                        return user.register(newUuid);
                    }
                }

                log('Client connecting with token : ' + uuid);
                user.register(uuid, msg.username);
            });
            socket.on('getToken', function () {
                const uuid = util.uuidv4();

                log('Client connecting with no token, will be using : ' + uuid);
                user.register(uuid);
            });
            socket.on('ping', function () {
                user.ping();
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
                        notifyUserInLobbyList((anotherUser) => anotherUser.sendChat(display));
                    }
                } catch (e) {
                    log("FAILED chat : " + e)
                }
            });

            socket.on('lobbyCreate', function (opts) {
                try {
                    const lobby = LobbyManager.create({
                        owner: user,
                        name: opts.name,
                        game: opts.game,
                        isPublic: opts.isPublic,
                        settings: opts.settings,
                    })
                    user.moveToLobby(lobby);
                    notifyUserInLobbyList((anotherUser) => anotherUser.notifyNewLobbyGame(lobby));
                } catch (e) {
                    log("FAILED lobbyCreate : " + e)
                }
            });
            socket.on('lobbyListJoin', function (gameData) {
                try {
                    const lobby = LobbyManager.getLobby(gameData.uuid);
                    user.moveToLobby(lobby);
                } catch (e) {
                    log("FAILED lobbyListJoin : " + e)
                }
            });

            socket.on('disconnect', function () {
                try {
                    userLeaveLobby(user);
                    user.disconnect();
                } catch (e) {
                    log("FAILED disconnect : " + e)
                }
            });

            socket.on('lobbyLeave', function (opts) {
                userLeaveLobby(user);
            });
            socket.on('lobbyUpdate', function (msg) {
                log('message: ' + msg);
            });
            socket.on('gameInput', function (payload) {
                try {
                    if (!user.isInLobby()) {
                        return;
                    }
                    user.lobby.handleGameInput(user, payload);
                } catch (e) {
                    log("FAILED gameInput : " + e)
                }
            });
        });
    }

}
