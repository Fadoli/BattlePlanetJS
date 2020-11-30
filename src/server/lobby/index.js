const Lobby = require('./lobby').Lobby;
const Client = require('../client').Client;

const private = {};
const public = {};

/**
* @typedef {Object} LobbyOptions
* @property {string} name
* @property {Client} owner
* @property {boolean} isPublic
*/

/**
 * @description What to do on lobby end
 * @param {Lobby} lobby 
 */
function OnLobbyEnd (lobby) {
    delete public[lobby.uuid];
    delete private[lobby.uuid];
}

module.exports = {
    /**
     * @description create a lobby with the given options
     * @param {LobbyOptions} lobbyOptions
     */
    create(lobbyOptions) {
        lobbyOptions.OnLobbyEnd = OnLobbyEnd;
        const lob = new Lobby(lobbyOptions);
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