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
const LobbyManager = require('./index');

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

describe("/server/lobby/index", () => {

    let creator, randomPlayer;
    let publicLobby, privateLobby;

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
            isPublic: false,
        };
    });

    it("Manage list of lobbys", () => {
        assert.deepStrictEqual(LobbyManager.getPublic(), []);
        const lob = LobbyManager.create(publicLobby);
        assert.deepStrictEqual(LobbyManager.getLobby(lob.uuid), lob);
        assert.deepStrictEqual(LobbyManager.getPublic(), [lob]);
        const lob2 = LobbyManager.create(privateLobby);
        assert.deepStrictEqual(LobbyManager.getPublic(), [lob]);
        assert.deepStrictEqual(LobbyManager.getLobby(lob2.uuid), lob2);
    });
});