// Test server GameManager with new engine
const GameManager = require('../src/games/BattlePlanet/server');

const gm = new GameManager({
    name: 'TestGame',
    settings: { botCount: 2, arenaSize: 'standard', starMode: 'single', hazards: 'none', aiDifficulty: 'standard', gameMode: 'team-vs-bots' }
});

// Simulate adding a player
const mockClient = {
    token: 'player1',
    name: 'Tester',
    sendGameState: (payload) => {
        console.log('Sent update:', payload.full ? 'FULL' : 'DELTA');
        if (!payload.full && payload.delta) {
            console.log('Delta types:', Object.keys(payload.delta));
        }
    }
};

gm.addPlayer(mockClient);
console.log('After addPlayer:', gm.engine.getSnapshot().players.map(p => p.name));

// Run a few ticks
for (let i = 0; i < 5; i++) {
    gm.tick();
}

gm.removePlayer(mockClient);
console.log('✅ Server GameManager test passed');
