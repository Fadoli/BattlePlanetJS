// eslint-disable-next-line
let describe, it, before, after, beforeEach, afterEach;
if (typeof Bun !== 'undefined') {
    describe = require('bun:test').describe;
    it = require('bun:test').test;
    before = require('bun:test').before;
    after = require('bun:test').after;
    beforeEach = require('bun:test').beforeEach;
    afterEach = require('bun:test').afterEach;
} else {
    describe = require('node:test').describe;
    it = require('node:test').it;
    before = require('node:test').before;
    after = require('node:test').after;
    beforeEach = require('node:test').beforeEach;
    afterEach = require('node:test').afterEach;
}

const assert = require('assert');
const Lobby = require('./lobby').Lobby;

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

describe("/server/lobby/lobby", () => {

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
        lobby = new Lobby({ owner: creator, name: 'my first game' });
    });

    it("by default the owner is a player", () => {
        assert.deepStrictEqual(lobby.players[creator.token], creator);
        assert.strictEqual(lobby.playerCount(), 1);
    });

    describe("addPlayer", () => {
        it("adding an existing user should do nothing", () => {
            const backup = clone(lobby.players);
            lobby.addPlayer(creator);
            assert.deepStrictEqual(lobby.players, backup);
            assert.strictEqual(lobby.playerCount(), 1);
        });

        it("adding another user should add him", () => {
            lobby.addPlayer(randomPlayer);

            assert.deepStrictEqual(lobby.players[creator.token], creator);
            assert.deepStrictEqual(lobby.players[randomPlayer.token], randomPlayer);
            assert.strictEqual(lobby.playerCount(), 2);
        });
    });
    
    describe("removePlayer", () => {
        it("removing an existing user should remove him", () => {
            lobby.removePlayer(creator);
            assert.strictEqual(lobby.players[creator.token], undefined);
            assert.strictEqual(lobby.playerCount(), 0);
        });

        it("removing another (non-existing) user should do nothing", () => {
            const backup = clone(lobby.players);
            lobby.removePlayer(randomPlayer);
            assert.deepStrictEqual(lobby.players, backup);
            assert.strictEqual(lobby.playerCount(), 1);
        });
    });
});