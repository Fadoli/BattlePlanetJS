require('tap').mochaGlobals()
const should = require('should')
const Lobby = require('./lobby').Lobby;

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

describe("/server/Lobby", () => {

    let creator, randomPlayer;
    /**
     * @type {Lobby}
     */
    let lobby;
    beforeEach(() => {
        creator = {
            token: 'owner'
        };
        randomPlayer = {
            token: 'a player'
        };
        lobby = new Lobby({owner: creator, name:'my first game'})
    });

    it("by default the owner is a player", () => {
        lobby.players[creator.token].should.eql(creator);
        lobby.playerCount().should.equal(1);
    })

    describe("addPlayer", () => {
        it("adding an existing user should do nothing", () => {
            const backup = clone(lobby.players);
            lobby.addPlayer(creator);
            lobby.players.should.eql(backup);
            lobby.playerCount().should.equal(1);
        })

        it("adding an other user should do add him", () => {
            lobby.addPlayer(randomPlayer);

            lobby.players[creator.token].should.eql(creator);
            lobby.players[randomPlayer.token].should.eql(randomPlayer);
            lobby.playerCount().should.equal(2);
        })
    });
    
    describe("removePlayer", () => {
        it("removing an existing user should remove him", () => {
            lobby.removePlayer(creator);
            (lobby.players[creator.token] === undefined).should.be.true();
            lobby.playerCount().should.equal(0);
        })

        it("removing an other (non existing) user should do nothing", () => {
            const backup = clone(lobby.players);
            lobby.removePlayer(randomPlayer);
            lobby.players.should.eql(backup);
            lobby.playerCount().should.equal(1);
        })
    });
});
