// Test client delta handling
// (Functions copied from game.js for isolated testing)

function cloneState(state) {
    return {
        ...state,
        sun: { ...state.sun },
        suns: (state.suns || [state.sun]).map(entry => ({ ...entry })),
        players: state.players.map(entry => ({ ...entry })),
        enemies: state.enemies.map(entry => ({ ...entry })),
        rocks: state.rocks.map(entry => ({ ...entry })),
        asteroids: (state.asteroids || []).map(entry => ({ ...entry })),
        explosions: (state.explosions || []).map(entry => ({ ...entry }))
    };
}

function applyDeltaToState(state, delta) {
    const types = ['players', 'enemies', 'rocks', 'asteroids', 'explosions', 'suns'];
    for (const type of types) {
        const patches = delta[type];
        if (!patches) continue;
        const arr = state[type];
        for (const patch of patches) {
            const id = patch.id;
            if (patch._removed) {
                const idx = arr.findIndex(e => e.id === id);
                if (idx !== -1) arr.splice(idx, 1);
            } else {
                let entity = arr.find(e => e.id === id);
                if (!entity) {
                    const { id: _, ...rest } = patch;
                    entity = { id, ...rest };
                    arr.push(entity);
                } else {
                    for (const key of Object.keys(patch)) {
                        if (key === 'id' || key === '_removed') continue;
                        entity[key] = patch[key];
                    }
                }
            }
        }
    }
}

// Simplified state structure
let baseState = {
    tickNumber: 1,
    serverTime: Date.now(),
    status: 'playing',
    worldRadius: 1750,
    sun: { id: 'sun-a', x: 0, y: 0, radius: 110, color: 0xffd166 },
    suns: [{ id: 'sun-a', x: 0, y: 0, radius: 110, color: 0xffd166 }],
    players: [
        { id: 'p1', name: 'Tester', team: 'player', x: 100, y: 200, vx: 1, vy: 2, radius: 45, angle: 0, health: 5, modifier: 1, color: 0x48d1ff, alive: true }
    ],
    enemies: [
        { id: 'e1', name: 'bot1', team: 'enemy', x: 300, y: 400, vx: -1, vy: -2, radius: 45, angle: Math.PI, health: 5, modifier: 1, color: 0xff6b6b, alive: true }
    ],
    rocks: [],
    explosions: [],
    asteroids: []
};

// Simulate receiving a delta that updates player position and adds a new rock
const delta = {
    players: [
        { id: 'p1', x: 110, y: 210, vx: 1.1, vy: 2.1 } // changed fields
    ],
    enemies: [
        { id: 'e1', x: 290, y: 390 } // changed
    ],
    rocks: [
        { id: 'r1', ownerId: 'p1', team: 'player', x: 155, y: 245, radius: 6, color: 0x48d1ff }
    ],
    meta: { tickNumber: 2, status: 'playing' }
};

// Apply delta
applyDeltaToState(baseState, delta);

// Verify changes
console.log('Player x:', baseState.players[0].x, 'expected 110');
console.log('Player y:', baseState.players[0].y, 'expected 210');
console.log('Enemy x:', baseState.enemies[0].x, 'expected 290');
console.log('Rock count:', baseState.rocks.length, 'expected 1');
console.log('Rock id:', baseState.rocks[0].id, 'expected r1');

// Test removal: remove the rock
const delta2 = {
    rocks: [
        { id: 'r1', _removed: true }
    ],
    meta: { tickNumber: 3 }
};
applyDeltaToState(baseState, delta2);
console.log('Rock count after removal:', baseState.rocks.length, 'expected 0');

// Test full state set
const fullState = {
    tickNumber: 10,
    status: 'playing',
    worldRadius: 1750,
    sun: { id: 'sun-a', x: 0, y: 0, radius: 110, color: 0xffd166 },
    suns: [{ id: 'sun-a', x: 0, y: 0, radius: 110, color: 0xffd166 }],
    players: [],
    enemies: [],
    rocks: [],
    explosions: [],
    asteroids: []
};
baseState = cloneState(fullState);
console.log('BaseState after full clone, players:', baseState.players.length, 'expected 0');

console.log('✅ Client delta tests passed');
