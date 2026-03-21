// Test that Lobby.addPlayer emits lobbyJoin to the client
const { Lobby } = require('../src/server/lobby/lobby');

// Capture emits
let lobbyJoinEmitted = false;
let lobbyJoinData = null;
let gameStateEmitted = false;
let gameStateData = null;

const mockClient = {
    token: 'test-token-123',
    name: 'Tester',
    socket: {
        emit: (event, data) => {
            if (event === 'lobbyJoin') {
                lobbyJoinEmitted = true;
                lobbyJoinData = data;
            }
        }
    },
    sendGameState: (payload) => {
        gameStateEmitted = true;
        gameStateData = payload;
    }
};

// Create a lobby (it will create a game internally)
const lobby = new Lobby({
    owner: mockClient,
    name: 'TestLobby',
    settings: {}
});

// Call addPlayer (simulate joining)
lobby.addPlayer(mockClient);

// Verify that 'lobbyJoin' was emitted with the lobby uuid
if (!lobbyJoinEmitted || lobbyJoinData !== lobby.uuid) {
    console.error('❌ Expected lobbyJoin emission with uuid. Got:', lobbyJoinEmitted, lobbyJoinData);
    process.exit(1);
}
console.log('✅ Lobby.addPlayer emits lobbyJoin with correct uuid');

// Verify that initial gameState (full) was sent to client
if (!gameStateEmitted || !gameStateData) {
    console.error('❌ Expected initial gameState emission');
    process.exit(1);
}
if (!gameStateData.full) {
    console.error('❌ Expected full state on join. Got:', gameStateData);
    process.exit(1);
}
if (gameStateData.state.playerId !== mockClient.token) {
    console.error('❌ Full state missing playerId. Got:', gameStateData.state.playerId);
    process.exit(1);
}
console.log('✅ Initial full gameState sent with playerId');
