require('tap').mochaGlobals()
const should = require('should')
const GameManager = require('../../src/game/gameManager').GameManager;

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

describe("/game/GameManager", () => {

    let creator, randomPlayer;
    /**
     * @type {GameManager}
     */
    let gameManager;
    beforeEach(() => {
        creator = {
            token: 'owner'
        };
        randomPlayer = {
            token: 'a player'
        };
        gameManager = new GameManager(creator, 'game', 'my fist game')
    });

    it("by default the owner is a player", () => {
        gameManager.players[creator.token].should.eql(creator);
        gameManager.playerCount().should.equal(1);
    })

    describe("addPlayer", () => {
        it("adding an existing user should do nothing", () => {
            const backup = clone(gameManager.players);
            gameManager.addPlayer(creator);
            gameManager.players.should.eql(backup);
            gameManager.playerCount().should.equal(1);
        })

        it("adding an other user should do add him", () => {
            gameManager.addPlayer(randomPlayer);

            gameManager.players[creator.token].should.eql(creator);
            gameManager.players[randomPlayer.token].should.eql(randomPlayer);
            gameManager.playerCount().should.equal(2);
        })
    });
    
    describe("removePlayer", () => {
        it("removing an existing user should remove him", () => {
            gameManager.removePlayer(creator);
            (gameManager.players[creator.token] === undefined).should.be.true();
            gameManager.playerCount().should.equal(0);
        })

        it("removing an other (non existing) user should do nothing", () => {
            const backup = clone(gameManager.players);
            gameManager.removePlayer(randomPlayer);
            gameManager.players.should.eql(backup);
            gameManager.playerCount().should.equal(1);
        })
    });
});
