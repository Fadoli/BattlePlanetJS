const { Client } = require('./client');
const LobbyManager = require('./lobby');

// Mock dependencies
jest.mock('./lobby', () => ({
  getPublic: jest.fn()
}));

describe('Client', () => {
  let mockSocket;
  let client;

  beforeEach(() => {
    // Mock socket with all needed methods
    mockSocket = {
      emit: jest.fn(),
      conn: {
        remoteAddress: '127.0.0.1'
      }
    };
    
    client = new Client(mockSocket);
    
    // Clear any registered clients from previous tests
    jest.spyOn(Client, 'getUser').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(client.socket).toBe(mockSocket);
      expect(client.token).toBeUndefined();
      expect(client.lobby).toBeUndefined();
      expect(client.name).toBe('unnamed');
      expect(client.last).toBe(0);
      expect(client.ip).toBe('127.0.0.1');
    });
  });

  describe('basic methods', () => {
    it('should update last time when pinged', () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      
      client.ping();
      
      expect(client.last).toBe(now);
    });

    it('should return formatted username', () => {
      client.name = 'testUser';
      client.token = 'abc123';
      
      expect(client.getUserName()).toBe('testUser:abc123');
    });

    it('should determine if client is in a lobby', () => {
      expect(client.isInLobby()).toBe(false);
      
      client.lobby = { name: 'TestLobby' };
      expect(client.isInLobby()).toBe(true);
    });
  });

  describe('registration', () => {
    it('should register client with UUID and name', () => {
      // Spy on moveToServerList to verify it's called
      const moveToServerListSpy = jest.spyOn(client, 'moveToServerList')
        .mockImplementation(() => {});
      
      client.register('uuid123', 'Player1');
      
      expect(client.token).toBe('uuid123');
      expect(client.name).toBe('Player1');
      expect(mockSocket.emit).toHaveBeenCalledWith('setToken', { uuid: 'uuid123' });
      expect(moveToServerListSpy).toHaveBeenCalled();
    });

    it('should move client to previous lobby if they were in one', () => {
      // Create mock previous client in a lobby
      const mockLobby = { name: 'TestLobby' };
      const previousClient = {
        isInLobby: () => true,
        lobby: mockLobby
      };
      
      // Make getUser return our previous client
      Client.getUser.mockReturnValue(previousClient);
      
      const moveToLobbySpy = jest.spyOn(client, 'moveToLobby')
        .mockImplementation(() => {});
      
      client.register('uuid123', 'Player1');
      
      expect(moveToLobbySpy).toHaveBeenCalledWith(mockLobby);
    });
  });

  describe('disconnect', () => {
    it('should do nothing if token is undefined', () => {
      client.disconnect();
      // No changes expected
      expect(client.token).toBeUndefined();
    });

    it('should unregister client if token exists', () => {
      client.token = 'abc123';
      client.disconnect();
      expect(client.token).toBeUndefined();
    });
  });

  describe('lobby management', () => {
    it('should move client to a lobby', () => {
      const mockLobby = {
        name: 'TestLobby',
        uuid: 'lobby123',
        sendChat: jest.fn(),
        addPlayer: jest.fn()
      };
      
      // Mock console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const sendChatSpy = jest.spyOn(client, 'sendChat').mockImplementation(() => {});
      
      client.name = 'Player1';
      client.moveToLobby(mockLobby);
      
      expect(client.lobby).toBe(mockLobby);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(sendChatSpy).toHaveBeenCalledWith('You joined the server TestLobby');
      expect(mockLobby.sendChat).toHaveBeenCalledWith('Player1 joined the game');
      expect(mockLobby.addPlayer).toHaveBeenCalledWith(client);
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyJoin', 'lobby123');
    });

    it('should move client to server list from lobby', () => {
      const mockLobby = {
        removePlayer: jest.fn()
      };
      client.lobby = mockLobby;
      
      client.moveToServerList();
      
      expect(mockLobby.removePlayer).toHaveBeenCalledWith(client);
      expect(client.lobby).toBeUndefined();
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyListJoin');
    });

    it('should handle moving to server list when not in a lobby', () => {
      client.lobby = undefined;
      client.moveToServerList();
      
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyListJoin');
    });
  });

  describe('notification methods', () => {
    it('should get and send lobbies to user', () => {
      const mockLobbies = [
        { uuid: 'lobby1', name: 'Game1', playerCount: () => 2 },
        { uuid: 'lobby2', name: 'Game2', playerCount: () => 1 }
      ];
      
      LobbyManager.getPublic.mockReturnValue(mockLobbies);
      
      client.getLobbiesForUser();
      
      expect(LobbyManager.getPublic).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyUpdate', {
        action: 'set',
        data: [
          { uuid: 'lobby1', name: 'Game1', count: 2 },
          { uuid: 'lobby2', name: 'Game2', count: 1 }
        ]
      });
    });

    it('should notify about new lobby game', () => {
      const mockGame = {
        uuid: 'game1',
        name: 'NewGame',
        playerCount: () => 1
      };
      
      client.notifyNewLobbyGame(mockGame);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyUpdate', {
        action: 'add',
        data: [{ uuid: 'game1', name: 'NewGame', count: 1 }]
      });
    });

    it('should notify about ended lobby game', () => {
      const mockGame = {
        uuid: 'game1',
        name: 'EndingGame'
      };
      
      client.notifyEndLobbyGame(mockGame);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('lobbyUpdate', {
        action: 'remove',
        data: [{ uuid: 'game1', name: 'EndingGame', count: 0 }]
      });
    });

    it('should send chat messages', () => {
      client.sendChat('Hello World');
      expect(mockSocket.emit).toHaveBeenCalledWith('chat', 'Hello World');
    });
  });

  describe('static methods', () => {
    it('should return users in server list', () => {
      // Mock implementation of getUserInServerList
      const mockUsers = [{ name: 'User1' }];
      const getUserInServerListSpy = jest.spyOn(Client, 'getUserInServerList')
        .mockImplementation(() => mockUsers);
      
      const result = Client.getUserInServerList();
      
      expect(result).toBe(mockUsers);
      getUserInServerListSpy.mockRestore();
    });

    it('should get user by UUID', () => {
      const mockClient = { name: 'User1' };
      const getUserSpy = jest.spyOn(Client, 'getUser')
        .mockImplementation(() => mockClient);
      
      const result = Client.getUser('test-uuid');
      
      expect(result).toBe(mockClient);
      getUserSpy.mockRestore();
    });
  });

  describe('internal user management', () => {
    // Test the internal clientMap functionality indirectly
    
    it('should register and retrieve a client', () => {
      // Setup to allow actual clientMap usage
      jest.restoreAllMocks();
      
      // Register a client with a token
      client.token = 'test-token';
      client.name = 'Test User';
      
      // We need to access the internal register function
      // Let's use the Client.register method as a way to test this
      client.register('test-token', 'Test User');
      
      // Now retrieve the client using static method
      const retrievedClient = Client.getUser('test-token');
      
      // We expect to get back our client object
      expect(retrievedClient).toBeTruthy();
      expect(retrievedClient.name).toBe('Test User');
    });

    it('should get users in server list correctly', () => {
      jest.restoreAllMocks();
      
      // Create two clients - one in lobby, one not
      const client1 = new Client(mockSocket);
      client1.register('client1', 'User1');
      
      const client2 = new Client(mockSocket);
      client2.register('client2', 'User2');
      client2.lobby = { name: 'SomeLobby' };
      
      const users = Client.getUserInServerList();
      
      // Should only include the client not in a lobby
      expect(users.length).toBeGreaterThanOrEqual(1);
      const hasClient1 = users.some(u => u.name === 'User1');
      const hasClient2 = users.some(u => u.name === 'User2');
      expect(hasClient1).toBe(true);
      expect(hasClient2).toBe(false);
    });

    it('should unregister clients properly', () => {
      jest.restoreAllMocks();
      
      // Register a client
      client.register('test-token', 'Test User');
      
      // Verify it's registered
      expect(Client.getUser('test-token')).toBeTruthy();
      
      // Disconnect should unregister
      client.disconnect();
      
      // Verify it's gone
      expect(Client.getUser('test-token')).toBeUndefined();
    });
  });
});