const Lobby = require('./lobby').Lobby;
const Client = require('../client').Client;

let privateList = {};
let publicList = {};

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
    delete publicList[lobby.uuid];
    delete privateList[lobby.uuid];
}

module.exports = {
    /**
     * @description create a lobby with the given options
     * @param {LobbyOptions} lobbyOptions
     */
    create(lobbyOptions = {}) {
        lobbyOptions.OnLobbyEnd = OnLobbyEnd;
        const lob = new Lobby(lobbyOptions);
        if (lobbyOptions.isPublic) {
            publicList[lob.uuid] = lob;
        } else {
            privateList[lob.uuid] = lob;
        }
        return lob;
    },
    
    /**
     * @description Get all the current public games
     * @returns {Array<Lobby>}
     */
    getPublic() {
        return Object.values(publicList);
    },
    /**
     * @description Get the lobby with a given UID (either public or private)
     * @returns {Lobby}
     */
    getLobby(uid) {
        return privateList[uid] || publicList[uid];
    },
    /**
     * @description Reset the internal lists : this is for test only !
     */
    empty() {
        privateList = {};
        publicList = {};
    }
}