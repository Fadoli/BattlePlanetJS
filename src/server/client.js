const GameManager = require("../game/gameManager").GameManager;

/**
 * @export
 * @class Client
 */
class Client {
    constructor(socket) {
        this.socket = socket;
        this.token = undefined;
        this.game = undefined;
        this.name = "unnamed";
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
        register(this);
        if (previous && previous.isInGame())
        {
            this.moveToGame(previous.game);
        }
        else 
        {
            this.moveToLobby();
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
    isInGame() {
        return (this.game !== undefined);
    }

    /**
     * Move the client to a game
     * @param {Game} a game instance
     * @memberof Client
     */
    moveToGame( instance ) {
        this.game = instance;

        // First notify users
        console.log(`${this.getUserName()} is joining ${this.game.name}`);
        this.sendChat(`You joined the server ${this.game.name}`);
        this.game.sendChat(`${this.name} joined the game`);

        this.game.addPlayer(this);
        

        this.socket.emit('gameJoin', this.game.uuid);
    }

    /**
     * Move the client back to the loby
     * @memberof Client
     * @returns {any} Either a game if it's a game end, otherwise nothing
     */
    moveToLobby() {
        let output = undefined;
        if (this.isInGame()) {
            // this function return itself if it was the last user
            output = this.game.removePlayer(this);
            this.game = undefined;
        }
        this.socket.emit("lobbyJoin");
        this.notifyLobbyGames();
        return output;
    }

    /**
     * Sends current game to user
     * @memberof Client
     */
    notifyLobbyGames() {
        const games = GameManager.getGames();
        const gameUserList = [];
        for (const game of games) {
            gameUserList.push({
                uuid: game.uuid,
                name: game.name,
                count: game.playerCount()
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
    static getUserInLoby() {
        return getUserInLoby();
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
function getUserInLoby() {
    const arr = [];
    const mapItems = Object.values(clientMap);
    for (const user of mapItems) {
        if (!user) {
            continue;
        }
        if (!user.isInGame()) {
            arr.push(user);
        }
    }
    return arr;
}

module.exports = {
    Client: Client
}