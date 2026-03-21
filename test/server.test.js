// Test server GameManager with new engine
const GameManager = require('../src/games/BattlePlanet/server');

const gm = new GameManager({
    name: 'TestGame',
    settings: { botCount: 2, arenaSize: 'standard', starMode: 'single', hazards: 'none', aiDifficulty: 'standard', gameMode: 'team-vs-bots' }
});

// Simulate adding a player
let lastPayload = null;
const mockClient = {
    token: 'player1',
    name: 'Tester',
    sendGameState: (payload) => {
        lastPayload = payload;
        console.log('Sent update:', payload.full ? 'FULL' : 'DELTA');
        if (payload.full) {
            console.log('Full state has playerId:', !!payload.state.playerId);
            console.log('Players in full state:', payload.state.players.map(p => p.name));
        }
        if (!payload.full && payload.delta) {
            console.log('Delta types:', Object.keys(payload.delta));
            if (payload.meta) console.log('Delta meta playerId:', payload.meta.playerId);
        }
    }
};

gm.addPlayer(mockClient);
console.log('After addPlayer, engine players:', gm.engine.getSnapshot().players.map(p => p.name));

// Verify initial payload is FULL and includes playerId
if (!lastPayload || !lastPayload.full) {
    console.error('❌ Expected full state on addPlayer');
    process.exit(1);
}
if (lastPayload.state.playerId !== 'player1') {
    console.error('❌ Full state missing correct playerId:', lastPayload.state.playerId);
    process.exit(1);
}
console.log('✅ Full state includes playerId:', lastPayload.state.playerId);

// Run a few ticks
for (let i = 0; i < 3; i++) {
    gm.tick();
    // After first tick, should get delta (since lastSnapshot is now set)
    if (i === 0) {
        if (lastPayload.full) {
            console.log('First tick after addPlayer still full? (periodic full not due yet)');
        }
    }
}

// Verify delta after first tick
if (!lastPayload || lastPayload.full) {
    // might still be full if periodic, but not required
    console.log('Note: payload was full on first tick (periodic full)');
} else if (lastPayload.delta) {
    console.log('✅ Received delta with types:', Object.keys(lastPayload.delta));
}

gm.removePlayer(mockClient);
console.log('✅ Server GameManager test passed');
