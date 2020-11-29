const Lobby = require('./lobby').Lobby;

const private = {};
const public = {};

/**
* @typedef {Object} LobbyOptions
* @property {string} name
* @property {string} owner
* @property {boolean} isPublic
*/

module.exports = {
    /**
     * @description create a lobby with the given options
     * @param {LobbyOptions} lobbyOptions
     */
    create(lobbyOptions) {
        const lob = new Lobby(lobbyOptions.owner, lobbyOptions.name);
        if (lobbyOptions.isPublic) {
            public[lob.uuid] = lob;
        } else {
            private[lob.uuid] = lob;
        }
        return lob;
    },
    /**
     * @description Get all the current public games
     * @returns {Array<Lobby>}
     */
    getPublic() {
        return Object.values(public);
    },
    /**
     * @description Get all the current public games
     * @returns {Array<Lobby>}
     */
    getLobby(uid) {
        return private[uid] || public[uid];
    },
}