/**
 * @export
 * @class Client
 */
export class Client {
    constructor(socket) {
        this.socket = socket;
        this.token = undefined;
        this.game = undefined;
    }

    /**
     * Register the UUID of a client
     * @param {string} UUID
     * @memberof Client
     */
    register(UUID) {
        this.token = UUID;
        register(this);
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
    moveToGame(id) {
        this.game = id;
        this.game.addPlayer(this);
    }

    /**
     * Move the client back to the loby
     * @memberof Client
     */
    moveToLoby() {
        if (!this.isInGame()) {
            return;
        }
        this.game.removePlayer(this);
        this.game = undefined;
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
