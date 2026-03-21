// Quick integration test for engine
const { GameEngine, computeDelta } = require('../src/games/BattlePlanet/engine');

// Test 1: Engine creation and snapshot
const engine = new GameEngine({ botCount: 2, arenaSize: 'standard', starMode: 'single', hazards: 'none', aiDifficulty: 'standard', gameMode: 'team-vs-bots' });
engine.addPlayer('player1', 'Tester');
const snapshot1 = engine.getSnapshot();
console.log('Snapshot keys:', Object.keys(snapshot1));
console.log('Players:', snapshot1.players.map(p => p.name));
console.log('Enemies:', snapshot1.enemies.length);
console.log('Rocks:', snapshot1.rocks.length);

// Test 2: Run a few ticks
for (let i = 0; i < 5; i++) {
    engine.update(1/60);
}
const snapshot2 = engine.getSnapshot();
console.log('After 5 ticks:');
console.log('Players alive:', snapshot2.players.filter(p => p.alive).length);
console.log('Rocks count:', snapshot2.rocks.length);

// Test 3: Delta computation
const delta = computeDelta(snapshot1, snapshot2, new Set(snapshot2.players.map(p => p.id)));
console.log('Delta types:', Object.keys(delta));
console.log('Delta meta:', delta.meta);

// Test 4: Interest management
const playerToken = snapshot2.players[0].id;
const visibleIds = engine.getVisibleEntityIds(playerToken);
console.log('Visible entity count:', visibleIds.size);

console.log('✅ All engine tests passed!');
