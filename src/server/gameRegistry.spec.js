require('tap').mochaGlobals();
const should = require('should');
const path = require('path');
const registry = require('./gameRegistry');

describe("/server/gameRegistry", () => {
    beforeEach(() => {
        registry.empty();
    });

    it("gameList is empty by default", () => {
        registry.gamesList().should.be.eql({});
    })
    
    it("init should import games", () => {
        // Init as empty, then load test files
        registry.gamesList().should.be.eql({});
        registry.init(path.join(__dirname, '../../test-files/'));

        const gameList = registry.gamesList();
        const game = gameList['ThisIsNotAGame'];

        game.client.should.eql('toto');
        game.server.should.not.eql(undefined);
        game.maxPlayer.should.eql(16);
        game.minPlayer.should.eql(2);
    })
    
    it("init and create game", () => {
        // Init as empty, then load test files
        registry.gamesList().should.be.eql({});
        registry.init(path.join(__dirname, '../../test-files/'));
        const game = registry.createGame({
            name: 'ThisIsNotAGame',
            minPlayer:4,
            maxPlayer:20,
        });
        game.should.not.eql(undefined);
    })
});