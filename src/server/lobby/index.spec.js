require('tap').mochaGlobals()
const should = require('should');
const LobbyManager = require('./index');

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

describe("/server/lobby/index", () => {

    let creator, randomPlayer;
    let publicLobby, privateLobby;
    /**
     * @type {Lobby}
     */
    beforeEach(() => {
        creator = {
            token: 'owner'
        };
        randomPlayer = {
            token: 'a player'
        };
        LobbyManager.empty();
        publicLobby = {
            name: "toto",
            owner: creator,
            isPublic: true,
        };
        privateLobby = {
            ...publicLobby,
            ...{
                isPublic: false,
            }
        };
    });

    it("Manage list of lobbys", () => {
        LobbyManager.getPublic().should.eql([]);
        const lob = LobbyManager.create(publicLobby)
        LobbyManager.getLobby(lob.uuid).should.eql(lob);
        LobbyManager.getPublic().should.eql([lob]);
        const lob2 = LobbyManager.create(privateLobby)
        LobbyManager.getPublic().should.eql([lob]);
        LobbyManager.getLobby(lob2.uuid).should.eql(lob2);
    })
});
