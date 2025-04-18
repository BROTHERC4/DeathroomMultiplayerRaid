import MultiplayerClient from './client.js';

/**
 * MultplayerBridge - Connects the existing main.js implementation with the MultiplayerClient
 * 
 * This bridge allows us to use the MultiplayerClient without modifying main.js directly.
 * It works by intercepting socket.io calls and redirecting them to our client.
 */
export default class MultplayerBridge {
    constructor(game) {
        this.game = game;
        this.client = new MultiplayerClient(game);
        this.originalSocketIo = null;
        
        // Setup client callbacks
        this.setupCallbacks();
    }
    
    /**
     * Install the bridge by replacing the socket.io implementation
     */
    install() {
        // Store original io implementation if it exists
        if (window.io) {
            this.originalSocketIo = window.io;
        }
        
        // Create a mockup socket.io that redirects to our client
        window.io = (url) => {
            console.log("Socket.io requested, using MultiplayerClient instead");
            
            // Connect the client
            this.client.connect();
            
            // Return a mock socket object that redirects to our client
            return this.createMockSocket();
        };
        
        return this;
    }
    
    /**
     * Uninstall the bridge and restore original socket.io
     */
    uninstall() {
        if (this.originalSocketIo) {
            window.io = this.originalSocketIo;
        }
    }
    
    /**
     * Create a mock socket object that redirects to our client
     */
    createMockSocket() {
        const self = this;
        
        // Create mock socket with event emitter API
        const mockSocket = {
            id: null,
            connected: false,
            
            // Event listeners
            listeners: {},
            
            // Emit an event to the server
            emit: function(event, ...args) {
                console.log(`[MockSocket] emit: ${event}`, args);
                
                // Handle different event types
                switch (event) {
                    case 'joinGame':
                        // Extract player data
                        const playerData = args[0];
                        self.client.playerId = playerData.id || self.client.playerId;
                        break;
                        
                    case 'hostParty':
                        self.client.hostParty();
                        break;
                        
                    case 'joinParty':
                        self.client.joinParty(args[0]);
                        break;
                        
                    case 'startGame':
                        self.client.startGame();
                        break;
                        
                    case 'playerMove':
                        // Extract movement data
                        const moveData = args[1];
                        self.client.sendPlayerMovement(moveData.position, moveData.rotation, moveData.action);
                        break;
                        
                    case 'playerAttack':
                    case 'bossAttacked':
                    case 'enemyAttacked':
                        self.client.sendPlayerAttack(args[1]);
                        break;
                        
                    case 'collectLoot':
                        self.client.sendLootCollected(args[1]);
                        break;
                        
                    default:
                        console.log(`[MockSocket] Unhandled event: ${event}`);
                }
            },
            
            // Register an event listener
            on: function(event, callback) {
                if (!this.listeners[event]) {
                    this.listeners[event] = [];
                }
                
                this.listeners[event].push(callback);
                
                // Map events to MultiplayerClient events
                switch (event) {
                    case 'connect':
                        self.client.onConnected = (id) => {
                            this.id = id;
                            this.connected = true;
                            this.callListeners('connect');
                        };
                        break;
                        
                    case 'gameJoined':
                        self.client.onGameStarted = (gameState) => {
                            // Convert gameState to expected format
                            const data = {
                                player: {
                                    id: self.client.playerId,
                                    type: 0,
                                    name: 'Player_' + self.client.playerId.substring(0, 5)
                                },
                                players: gameState.players || [],
                                room: gameState.rooms ? gameState.rooms[gameState.currentRoom || 0] : null
                            };
                            
                            this.callListeners('gameJoined', data);
                        };
                        break;
                        
                    case 'playerJoined':
                        self.client.onPlayerJoined = (playerId) => {
                            const playerData = {
                                id: playerId,
                                type: 0,
                                name: 'Player_' + playerId.substring(0, 5)
                            };
                            this.callListeners('playerJoined', playerData);
                        };
                        break;
                        
                    case 'playerLeft':
                        self.client.onPlayerLeft = (playerId) => {
                            this.callListeners('playerLeft', playerId);
                        };
                        break;
                        
                    case 'playerMoved':
                        self.client.onInputUpdate = (playerId, inputData) => {
                            this.callListeners('playerMoved', {
                                id: playerId,
                                position: inputData.position,
                                rotation: inputData.rotation,
                                action: inputData.action
                            });
                        };
                        break;
                        
                    case 'bossUpdate':
                        self.client.onBossHealthUpdate = (bossData) => {
                            this.callListeners('bossUpdate', bossData);
                        };
                        break;
                        
                    case 'roomComplete':
                        self.client.onRoomCompleted = (data) => {
                            this.callListeners('roomComplete', {
                                nextRoom: data.newRoom
                            });
                        };
                        break;
                        
                    case 'gameOver':
                        self.client.onGameOver = (data) => {
                            this.callListeners('gameOver', data);
                        };
                        break;
                        
                    case 'disconnect':
                        self.client.onDisconnected = () => {
                            this.connected = false;
                            this.callListeners('disconnect');
                        };
                        break;
                }
            },
            
            // Helper method to call all listeners for an event
            callListeners: function(event, ...args) {
                if (this.listeners[event]) {
                    for (const callback of this.listeners[event]) {
                        callback(...args);
                    }
                }
            },
            
            // Disconnect from server
            disconnect: function() {
                self.client.disconnect();
                this.connected = false;
            }
        };
        
        return mockSocket;
    }
    
    /**
     * Setup client callbacks for events that don't need to be
     * directly mapped to socket.io events
     */
    setupCallbacks() {
        // These are additional events that might be useful
        // but aren't directly mapped to socket.io in main.js
        
        this.client.onPartyHosted = (partyCode) => {
            console.log(`Party hosted: ${partyCode}`);
        };
        
        this.client.onPartyJoined = (partyCode, players) => {
            console.log(`Joined party: ${partyCode}`);
        };
        
        this.client.onJoinError = (error) => {
            console.error(`Join error: ${error}`);
        };
        
        this.client.onNewHost = (hostId) => {
            console.log(`New host: ${hostId}`);
        };
    }
}

// Auto-install when imported if window.io doesn't exist yet
if (!window.io) {
    console.log("Auto-installing MultplayerBridge");
    const bridge = new MultplayerBridge().install();
    window.multiplayerBridge = bridge;
} 