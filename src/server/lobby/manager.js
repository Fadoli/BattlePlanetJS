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
            public.append(lob);
        } else {
            private.append(lob);
        }
        return lob;
    },
    /**
     * @description Get all the current public games
     * @returns {Array<GameManager>}
     */
    getPublic() {
        return Object.values(public);
    },
    /**
     * @description Get all the current public games
     * @returns {Array<GameManager>}
     */
    getLobby(uid) {
        return private[uid] || public[uid];
    },
}