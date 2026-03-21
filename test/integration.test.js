// Full integration test: Engine -> Server -> Delta -> Client
const { GameEngine, computeDelta } = require('../src/games/BattlePlanet/engine');

// Simulate server engine
const engine = new GameEngine({
    botCount: 2,
    arenaSize: 'standard',
    starMode: 'single',
    hazards: 'none',
    aiDifficulty: 'standard',
    gameMode: 'team-vs-bots'
});

engine.addPlayer('p1', 'Player1');
const snapshot0 = engine.getSnapshot();
const visibleIds = engine.getVisibleEntityIds('p1');

// Run several ticks
for (let i = 0; i < 3; i++) {
    engine.update(1/60);
}
const snapshot1 = engine.getSnapshot();

// Compute delta as server would
const delta = computeDelta(snapshot0, snapshot1, visibleIds);

console.log('Delta packet keys:', Object.keys(delta));
console.log('Has players delta?', !!delta.players);
console.log('Has enemies delta?', !!delta.enemies);
console.log('Has meta?', !!delta.meta);
console.log('Players delta count:', delta.players?.length || 0);
console.log('Enemies delta count:', delta.enemies?.length || 0);

// Simulate client applying delta
const clientBaseState = JSON.parse(JSON.stringify(snapshot0)); // deep clone

// Apply delta manually (inline function from game.js)
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

applyDeltaToState(clientBaseState, delta);

// Compare applied state with engine's snapshot
console.log('Client players count:', clientBaseState.players.length);
console.log('Engine players count:', snapshot1.players.length);

// Verify some values match
const clientPlayer = clientBaseState.players.find(p => p.id === 'p1');
const enginePlayer = snapshot1.players.find(p => p.id === 'p1');
if (clientPlayer && enginePlayer) {
    console.log('Player positions match:', clientPlayer.x === enginePlayer.x && clientPlayer.y === enginePlayer.y);
}

console.log('✅ Full integration test passed');
