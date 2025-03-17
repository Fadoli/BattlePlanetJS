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
const path = require('path');
const registry = require('./gameRegistry');

describe("/server/gameRegistry", () => {
    beforeEach(() => {
        registry.empty();
    });

    it("gameList is empty by default", () => {
        assert.deepStrictEqual(registry.gamesList(), {});
    });
    
    it("init should import games", () => {
        // Init as empty, then load test files
        assert.deepStrictEqual(registry.gamesList(), {});
        registry.init(path.join(__dirname, '../../test-files/'));

        const gameList = registry.gamesList();
        const game = gameList['ThisIsNotAGame'];

        assert.strictEqual(game.client, 'toto');
        assert.notStrictEqual(game.server, undefined);
        assert.strictEqual(game.maxPlayer, 16);
        assert.strictEqual(game.minPlayer, 2);
    });
    
    it("init and create game", () => {
        // Init as empty, then load test files
        assert.deepStrictEqual(registry.gamesList(), {});
        registry.init(path.join(__dirname, '../../test-files/'));
        const game = registry.createGame({
            name: 'ThisIsNotAGame',
            minPlayer: 4,
            maxPlayer: 20,
        });
        assert.notStrictEqual(game, undefined);
    });
});