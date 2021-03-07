const LobbyManager = require('./lobby');

/**
 * @export
 * @class Client
 */
class Client {
    constructor(socket) {
        this.socket = socket;
        this.token = undefined;
        /**
         * @type {}
         */
        this.lobby = undefined;
        this.name = "unnamed";
        this.last = 0;
        this.ip = socket.conn.remoteAddress;
    }

    ping() {
        this.last = Date.now();
    }

    getUserName() {
        return `${this.name}:${this.token}`;
    }

    /**
     * Register the UUID of a client
     * @param {string} uuid
     * @param {string} name
     * @memberof Client
     */
    register(uuid, name) {
        const previous = Client.getUser(uuid);
        this.token = uuid;
        this.socket.emit('setToken', {
            uuid: uuid
        })
        this.name = name;
        this.ping();
        register(this);
        if (previous && previous.isInLobby())
        {
            this.moveToLobby(previous.lobby);
        }
        else 
        {
            this.moveToServerList();
        }
    }
    /**
     * Disconenct the client
     * @param {string} UUID
     * @memberof Client
     */
    disconnect() {
        if (!this.token) {
            return;
        }
        this.token = undefined;
        unregister(this);
    }

    /**
     * Is the client in a game ?
     * @returns {boolean}
     * @memberof Client
     */
    isInLobby() {
        return (this.lobby !== undefined);
    }

    /**
     * Move the client to a game
     * @param {Game} a game instance
     * @memberof Client
     */
    moveToLobby( instance ) {
        this.lobby = instance;

        // First notify users
        console.log(`${this.getUserName()} is joining ${this.lobby.name}`);
        this.sendChat(`You joined the server ${this.lobby.name}`);
        this.lobby.sendChat(`${this.name} joined the game`);

        this.lobby.addPlayer(this);
        

        this.socket.emit('lobbyJoin', this.lobby.uuid);
    }

    /**
     * Move the client back to the loby
     * @memberof Client
     * @returns {any} Either a game if it's a game end, otherwise nothing
     */
    moveToServerList() {
        if (this.isInLobby()) {
            this.lobby.removePlayer(this);
            this.lobby = undefined;
        }
        this.socket.emit("lobbyListJoin");
    }

    /**
     * Sends current game to user
     * @memberof Client
     */
    getLobbiesForUser() {
        const lobbies = LobbyManager.getPublic();
        const gameUserList = [];
        for (const lobby of lobbies) {
            gameUserList.push({
                uuid: lobby.uuid,
                name: lobby.name,
                count: lobby.playerCount()
            })
        }
        this.socket.emit("lobbyUpdate", {
            action: 'set',
            data: gameUserList
        });
    }
    /**
     * Sends current game to user
     * @memberof Client
     */
    notifyNewLobbyGame(game) {
        this.socket.emit("lobbyUpdate", {
            action: 'add',
            data: [{
                uuid: game.uuid,
                name: game.name,
                count: game.playerCount()
            }]
        });
    }
    /**
     * Sends current game to user
     * @memberof Client
     */
    notifyEndLobbyGame(game) {
        this.socket.emit("lobbyUpdate", {
            action: 'remove',
            data: [{
                uuid: game.uuid,
                name: game.name,
                count: 0
            }]
        });
    }

    /**
     * Send a chat message to an end user
     * @param {string} msg
     * @memberof Client
     */
    sendChat( msg ) {
        this.socket.emit('chat', msg);
    }

    /**
     * Return the list of client that are on the lobby
     * @static
     * @returns {Array<Client>}
     * @memberof Client
     */
    static getUserInServerList() {
        return getUserInServerList();
    }

    /**
     * Return the user with such uuid
     * @static
     * @param {string} uuid
     * @returns {Client}
     * @memberof Client
     */
    static getUser (uuid) {
        return clientMap[uuid];
    }
}

/**
 * @type {Object.<string,Client>}
 */
const clientMap = {};

/**
 * Register an user
 * @param {Client} client
 */
function register(client) {
    clientMap[client.token] = client;
}
/**
 * Unregister a user that timed out
 * @param {Client} client
 */
function unregister(client) {
    clientMap[client.token] = undefined;
}
/**
 * Returns the list of clients that are not in a game
 * @returns Array<Client>
 */
function getUserInServerList() {
    const arr = [];
    const mapItems = Object.values(clientMap);
    for (const user of mapItems) {
        if (!user) {
            continue;
        }
        if (!user.isInLobby()) {
            arr.push(user);
        }
    }
    return arr;
}

module.exports = {
    Client: Client
}