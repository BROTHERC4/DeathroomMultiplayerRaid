import * as THREE from 'three';

/**
 * MultiplayerClient - Handles socket connection and events for multiplayer
 */
export default class MultiplayerClient {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.connected = false;
        this.partyCode = null;
        this.isHost = false;
        this.playerId = null;
    }

    /**
     * Connect to the server
     */
    connect() {
        // Determine server URL based on environment
        const SERVER_URL = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : window.location.origin;

        // Connect to server with Socket.io
        this.socket = io(SERVER_URL);

        // Setup connection events
        this.setupConnectionEvents();
        
        return this;
    }

    /**
     * Setup all socket event listeners
     */
    setupConnectionEvents() {
        if (!this.socket) return;

        // Connection established
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.connected = true;
            this.playerId = this.socket.id;
            
            // Trigger connection callback if provided
            if (this.onConnected) {
                this.onConnected(this.playerId);
            }
        });

        // Party hosted event
        this.socket.on('partyHosted', (partyCode) => {
            console.log('Party hosted:', partyCode);
            this.partyCode = partyCode;
            this.isHost = true;
            
            if (this.onPartyHosted) {
                this.onPartyHosted(partyCode);
            }
        });

        // Join success event
        this.socket.on('joinSuccess', (partyCode, playerList) => {
            console.log('Joined party:', partyCode);
            this.partyCode = partyCode;
            
            if (this.onPartyJoined) {
                this.onPartyJoined(partyCode, playerList);
            }
        });

        // Join error event
        this.socket.on('joinError', (errorMsg) => {
            console.error('Join error:', errorMsg);
            
            if (this.onJoinError) {
                this.onJoinError(errorMsg);
            }
        });

        // Player joined event
        this.socket.on('playerJoined', (playerId) => {
            console.log('Player joined:', playerId);
            
            if (this.onPlayerJoined) {
                this.onPlayerJoined(playerId);
            }
        });

        // Player left event
        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            
            if (this.onPlayerLeft) {
                this.onPlayerLeft(playerId);
            }
        });

        // New host event
        this.socket.on('newHost', (hostId) => {
            console.log('New host:', hostId);
            this.isHost = (hostId === this.playerId);
            
            if (this.onNewHost) {
                this.onNewHost(hostId);
            }
        });

        // Game started event
        this.socket.on('gameStarted', (gameState) => {
            console.log('Game started:', gameState);
            
            if (this.onGameStarted) {
                this.onGameStarted(gameState);
            }
        });

        // Input update event
        this.socket.on('inputUpdate', (playerId, inputData) => {
            if (this.onInputUpdate) {
                this.onInputUpdate(playerId, inputData);
            }
        });

        // Player attacked event
        this.socket.on('playerAttacked', (playerId, attackData) => {
            if (this.onPlayerAttacked) {
                this.onPlayerAttacked(playerId, attackData);
            }
        });

        // Boss health update event
        this.socket.on('bossHealthUpdate', (bossData) => {
            if (this.onBossHealthUpdate) {
                this.onBossHealthUpdate(bossData);
            }
        });

        // Player health update event
        this.socket.on('playerHealthUpdate', (playerId, health) => {
            if (this.onPlayerHealthUpdate) {
                this.onPlayerHealthUpdate(playerId, health);
            }
        });

        // Enemy defeated event
        this.socket.on('enemyDefeated', (data) => {
            if (this.onEnemyDefeated) {
                this.onEnemyDefeated(data);
            }
        });

        // Room completed event
        this.socket.on('roomCompleted', (data) => {
            if (this.onRoomCompleted) {
                this.onRoomCompleted(data);
            }
        });

        // Player died event
        this.socket.on('playerDied', (playerId) => {
            if (this.onPlayerDied) {
                this.onPlayerDied(playerId);
            }
        });

        // Game over event
        this.socket.on('gameOver', (data) => {
            if (this.onGameOver) {
                this.onGameOver(data);
            }
        });

        // Loot collected event
        this.socket.on('lootCollected', (data) => {
            if (this.onLootCollected) {
                this.onLootCollected(data);
            }
        });

        // Disconnection
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
            
            if (this.onDisconnected) {
                this.onDisconnected();
            }
        });
    }

    /**
     * Host a new party
     */
    hostParty() {
        if (!this.connected) return false;
        this.socket.emit('hostParty');
        return true;
    }

    /**
     * Join an existing party
     * @param {string} partyCode - The party code to join
     */
    joinParty(partyCode) {
        if (!this.connected) return false;
        this.socket.emit('joinParty', partyCode);
        return true;
    }

    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.connected || !this.isHost || !this.partyCode) return false;
        this.socket.emit('startGame', this.partyCode);
        return true;
    }

    /**
     * Send player movement update
     * @param {Object} position - Player position
     * @param {Object} rotation - Player rotation
     * @param {string} action - Current player action/animation
     */
    sendPlayerMovement(position, rotation, action) {
        if (!this.connected || !this.partyCode) return false;
        
        this.socket.emit('playerInput', this.partyCode, {
            id: this.playerId,
            position,
            rotation,
            action
        });
        
        return true;
    }

    /**
     * Send player attack
     * @param {Object} attackData - Attack data (target, damage, etc)
     */
    sendPlayerAttack(attackData) {
        if (!this.connected || !this.partyCode) return false;
        
        this.socket.emit('playerAttack', this.partyCode, {
            ...attackData,
            attackerId: this.playerId
        });
        
        return true;
    }

    /**
     * Report player damage
     * @param {number} amount - Amount of damage taken
     */
    sendPlayerDamaged(amount) {
        if (!this.connected || !this.partyCode) return false;
        
        this.socket.emit('playerDamaged', this.partyCode, {
            amount,
            playerId: this.playerId
        });
        
        return true;
    }

    /**
     * Send loot collection
     * @param {string} lootId - ID of the loot being collected
     */
    sendLootCollected(lootId) {
        if (!this.connected || !this.partyCode) return false;
        
        this.socket.emit('collectLoot', this.partyCode, lootId);
        
        return true;
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    }
} 