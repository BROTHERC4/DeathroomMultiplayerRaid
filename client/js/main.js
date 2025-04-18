import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Game from './core/game.js';
import Player from './entities/player.js';
import Enemy from './entities/enemy.js';
import MultiplayerClient from './multiplayer/client.js';
import { initializeMobileSupport, setupMobileControls } from './core/mobile.js';

// Main game variables
let scene, camera, renderer, controls;
let game;
let multiplayerClient;
let playerID;
let playerEntities = {};
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Game settings
const settings = {
    shadows: !isMobile,
    quality: isMobile ? 'low' : 'high',
    fov: 75,
    movementSpeed: 5,
    rotationSpeed: 2,
    debugMode: false
};

// Game state management
let gameState = {
  currentScreen: 'loading',
  partyId: null,
  isHost: false,
  players: [],
  isMultiplayer: false
};

// Initialize the game
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Enable shadows if not on mobile
    if (settings.shadows) {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    // Add renderer to page
    document.body.appendChild(renderer.domElement);
    
    // Add orbit controls for camera (will be replaced with player controls later)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Create lighting
    setupLighting();
    
    // Initialize game engine
    game = new Game().init(scene, camera, renderer, isMobile);
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
    
    // Initialize multiplayer client
    initializeMultiplayer();
    
    // Setup UI event listeners
    setupUIListeners();
    
    // Start animation loop
    animate();
    
    // Show menu screen
    showScreen('menu');
    
    // Mobile support
    if (isMobile) {
        initializeMobileSupport();
    }
    
    console.log('Game initialized');
}

function setupLighting() {
    // Main directional light (sun)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = settings.shadows;
    if (settings.shadows) {
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 50;
        dirLight.shadow.camera.left = -20;
        dirLight.shadow.camera.right = 20;
        dirLight.shadow.camera.top = 20;
        dirLight.shadow.camera.bottom = -20;
    }
    scene.add(dirLight);
    
    // Ambient light
    const ambLight = new THREE.AmbientLight(0x333333);
    scene.add(ambLight);
    
    // Add hemisphere light for better ambient gradient
    const hemiLight = new THREE.HemisphereLight(0x88ccff, 0x444444, 0.5);
    scene.add(hemiLight);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function initializeMultiplayer() {
    // Create multiplayer client
    multiplayerClient = new MultiplayerClient(game);
    
    // Connect to server event callbacks
    multiplayerClient.onConnected = (id) => {
        playerID = id;
        console.log('Connected with ID:', playerID);
    };
    
    multiplayerClient.onPartyHosted = (partyCode) => {
        gameState.partyId = partyCode;
        gameState.isHost = true;
        
        // Update UI
        document.getElementById('party-code').textContent = partyCode;
        
        // Show lobby screen
        showScreen('lobby');
        updateLobbyPlayers([playerID]);
    };
    
    multiplayerClient.onPartyJoined = (partyCode, playerList) => {
        gameState.partyId = partyCode;
        gameState.players = playerList;
        
        // Update UI
        document.getElementById('party-code').textContent = partyCode;
        
        // Show lobby screen
        showScreen('lobby');
        updateLobbyPlayers(playerList);
    };
    
    multiplayerClient.onJoinError = (errorMsg) => {
        alert('Failed to join party: ' + errorMsg);
    };
    
    multiplayerClient.onPlayerJoined = (playerId) => {
        // Add to players list
        if (!gameState.players.includes(playerId)) {
            gameState.players.push(playerId);
        }
        
        // Update lobby UI
        updateLobbyPlayers(gameState.players);
        
        // If already in game, add remote player
        if (gameState.currentScreen === 'game' && game.running) {
            addRemotePlayer({ id: playerId });
        }
    };
    
    multiplayerClient.onPlayerLeft = (playerId) => {
        // Remove from players list
        gameState.players = gameState.players.filter(p => p !== playerId);
        
        // Update lobby UI
        updateLobbyPlayers(gameState.players);
        
        // If in game, remove player
        if (gameState.currentScreen === 'game' && game.running) {
            removePlayer(playerId);
        }
    };
    
    multiplayerClient.onNewHost = (hostId) => {
        gameState.isHost = (hostId === playerID);
        
        // Update UI
        updateLobbyPlayers(gameState.players);
        
        // Enable/disable start button
        const startButton = document.getElementById('startGameBtn');
        if (startButton) {
            startButton.disabled = !gameState.isHost;
        }
    };
    
    multiplayerClient.onGameStarted = (gameStateData) => {
        gameState.isMultiplayer = true;
        
        // Show game screen
        showScreen('game');
        
        // Setup local player
        setupLocalPlayer({
            id: playerID,
            type: 0,
            name: 'Player_' + playerID.substring(0, 5)
        });
        
        // Add other players
        for (const playerId of gameState.players) {
            if (playerId !== playerID) {
                addRemotePlayer({
                    id: playerId,
                    type: 0,
                    name: 'Player_' + playerId.substring(0, 5)
                });
            }
        }
        
        // Load first room
        if (gameStateData && gameStateData.rooms && gameStateData.rooms.length > 0) {
            const roomIndex = gameStateData.currentRoom || 0;
            game.loadRoom(gameStateData.rooms[roomIndex]);
        }
        
        // Start game
        game.start();
        
        // Show game UI
        document.getElementById('game-ui').style.display = 'block';
    };
    
    multiplayerClient.onInputUpdate = (playerId, inputData) => {
        updateRemotePlayer({
            id: playerId,
            position: inputData.position,
            rotation: inputData.rotation,
            action: inputData.action
        });
    };
    
    multiplayerClient.onPlayerAttacked = (playerId, attackData) => {
        // Handle remote player attack
        const player = playerEntities[playerId];
        
        if (player) {
            player.attack();
        }
    };
    
    multiplayerClient.onBossHealthUpdate = (bossData) => {
        updateBoss(bossData);
    };
    
    multiplayerClient.onPlayerHealthUpdate = (playerId, health) => {
        const player = playerEntities[playerId];
        
        if (player) {
            player.stats.health = health;
            
            // Update UI if local player
            if (playerId === playerID) {
                updatePlayerHealthUI(health);
            }
        }
    };
    
    multiplayerClient.onRoomCompleted = (data) => {
        console.log('Room completed:', data);
        
        // Show room complete message
        showNotification(`Room cleared! Moving to next room...`);
        
        // Load next room
        if (data.newRoom) {
            game.loadRoom(data.newRoom);
        }
    };
    
    multiplayerClient.onGameOver = (data) => {
        console.log('Game over:', data);
        game.stop();
        showGameOver(data);
    };
    
    // Connect to server
    multiplayerClient.connect();
}

function setupUIListeners() {
    // Host party button
    document.getElementById('hostPartyBtn').addEventListener('click', () => {
        multiplayerClient.hostParty();
    });
    
    // Join party button
    document.getElementById('joinPartyBtn').addEventListener('click', () => {
        showScreen('join');
    });
    
    // Solo play button
    document.getElementById('soloPlayBtn').addEventListener('click', () => {
        startSoloGame();
    });
    
    // Submit code button
    document.getElementById('submitCodeBtn').addEventListener('click', () => {
        const codeInput = document.getElementById('party-code-input');
        if (codeInput && codeInput.value) {
            multiplayerClient.joinParty(codeInput.value.trim().toUpperCase());
        }
    });
    
    // Back button from join screen
    document.getElementById('backToMenuBtn').addEventListener('click', () => {
        showScreen('menu');
    });
    
    // Start game button
    document.getElementById('startGameBtn').addEventListener('click', () => {
        if (gameState.isHost) {
            multiplayerClient.startGame();
        }
    });
    
    // Leave party button
    document.getElementById('leavePartyBtn').addEventListener('click', () => {
        multiplayerClient.disconnect();
        showScreen('menu');
        
        // Reconnect for future games
        setTimeout(() => {
            multiplayerClient.connect();
        }, 500);
    });
    
    // Copy party code button
    document.getElementById('copy-code').addEventListener('click', () => {
        const partyCode = document.getElementById('party-code').textContent;
        navigator.clipboard.writeText(partyCode)
            .then(() => {
                // Show feedback
                const copyBtn = document.getElementById('copy-code');
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 1500);
            });
    });
    
    // Game over screen buttons
    document.getElementById('backToMenuFromGameOverBtn').addEventListener('click', () => {
        window.location.reload(); // Simple reload for now
    });
    
    document.getElementById('restartGameBtn').addEventListener('click', () => {
        if (gameState.isMultiplayer) {
            showScreen('lobby');
        } else {
            startSoloGame();
        }
    });
}

function showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show requested screen
    const targetScreen = document.getElementById(screenName + '-screen');
    if (targetScreen) {
        targetScreen.classList.add('active');
        gameState.currentScreen = screenName;
    }
    
    // Hide loading screen if showing another screen
    if (screenName !== 'loading') {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
        }
    }
    
    // Show game UI only when in game
    const gameUI = document.getElementById('game-ui');
    if (gameUI) {
        gameUI.style.display = screenName === 'game' ? 'block' : 'none';
    }
    
    // Show mobile controls only when in game and on mobile
    const mobileControls = document.getElementById('mobile-controls');
    if (mobileControls && isMobile) {
        mobileControls.style.display = screenName === 'game' ? 'block' : 'none';
    }
}

function updateLobbyPlayers(playerList) {
    const playersContainer = document.getElementById('party-members');
    if (!playersContainer) return;
    
    // Clear existing players
    playersContainer.innerHTML = '';
    
    // Add players to lobby
    for (const playerId of playerList) {
        const playerElement = document.createElement('div');
        playerElement.className = 'party-member';
        
        const avatar = document.createElement('div');
        avatar.className = 'member-avatar';
        playerElement.appendChild(avatar);
        
        const nameElement = document.createElement('div');
        nameElement.className = 'member-name';
        nameElement.textContent = 'Player_' + playerId.substring(0, 5);
        playerElement.appendChild(nameElement);
        
        // Mark host
        if (multiplayerClient.isHost && playerId === playerID) {
            const hostBadge = document.createElement('div');
            hostBadge.className = 'host-indicator';
            hostBadge.textContent = 'HOST';
            playerElement.appendChild(hostBadge);
        }
        
        playersContainer.appendChild(playerElement);
    }
    
    // Show/hide start button based on host status
    const startButton = document.getElementById('startGameBtn');
    if (startButton) {
        startButton.disabled = !multiplayerClient.isHost;
    }
}

function startSoloGame() {
    gameState.isMultiplayer = false;
    
    // Show game screen
    showScreen('game');
    
    // Setup player
    setupLocalPlayer({
        id: 'player-1',
        type: 0,
        name: 'Player'
    });
    
    // Generate a simple room with boss
    const firstRoom = {
        id: 'room-1',
        type: 'Dungeon Cell',
        difficulty: 1,
        isBossRoom: true,
        enemies: [],
        boss: {
            id: 'boss-1',
            name: 'Reanimated Executioner',
            type: 0,
            health: 200,
            maxHealth: 200,
            position: { x: 0, y: 1, z: 0 }
        }
    };
    
    // Load first room
    game.loadRoom(firstRoom);
    
    // Start game
    game.start();
    
    // Show game UI
    document.getElementById('game-ui').style.display = 'block';
}

function setupLocalPlayer(playerData) {
    // Create local player
    const player = new Player(playerData.id, true);
    player.mesh.name = playerData.name;
    
    // Add player to scene and game
    scene.add(player.yawObject);
    game.addEntity(player);
    
    // Store player reference
    game.player = player;
    playerEntities[playerData.id] = player;
    playerID = playerData.id;
    
    // Setup camera follow
    setupCameraFollow(player);
    
    // Setup mobile controls if needed
    if (isMobile) {
        setupMobileControls(player);
    }
    
    // Update health display
    updatePlayerHealthUI(player.stats.health);
    
    return player;
}

function setupCameraFollow(player) {
    // Disable orbit controls
    controls.enabled = false;
    
    // Add camera to player's pitch object
    player.pitchObject.add(camera);
    camera.position.set(0, 0, 0);
}

function addRemotePlayer(playerData) {
    // Create remote player
    const player = new Player(playerData.id, false);
    
    // Add name
    if (playerData.name) {
        player.mesh.name = playerData.name;
    }
    
    // Set initial position if provided
    if (playerData.position) {
        player.yawObject.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
    }
    
    // Add player to scene and game
    scene.add(player.yawObject);
    game.addEntity(player);
    
    // Store player reference
    game.otherPlayers[playerData.id] = player;
    playerEntities[playerData.id] = player;
    
    return player;
}

function removePlayer(id) {
    const player = playerEntities[id];
    
    if (player) {
        // Remove from scene and game
        scene.remove(player.yawObject);
        game.removeEntity(player);
        
        // Remove from references
        delete game.otherPlayers[id];
        delete playerEntities[id];
    }
}

function updateRemotePlayer(data) {
    const player = playerEntities[data.id];
    
    if (player && player !== game.player) {
        // Update position
        if (data.position) {
            player.yawObject.position.set(
                data.position.x,
                data.position.y,
                data.position.z
            );
        }
        
        // Update rotation
        if (data.rotation) {
            player.yawObject.rotation.y = data.rotation.y;
            if (data.rotation.x !== undefined) {
                player.pitchObject.rotation.x = data.rotation.x;
            }
        }
        
        // Update animation state
        if (data.action) {
            player.animationState = data.action;
        }
    }
}

function updateBoss(data) {
    // Update boss if it exists
    if (game.currentBoss && data) {
        // Update position
        if (data.position) {
            game.currentBoss.mesh.position.set(
                data.position.x,
                data.position.y,
                data.position.z
            );
        }
        
        // Update rotation
        if (data.rotation) {
            game.currentBoss.mesh.rotation.y = data.rotation.y;
        }
        
        // Update health
        if (data.health !== undefined) {
            game.currentBoss.health = data.health;
            updateBossHealthUI();
        }
        
        // Update phase
        if (data.phase !== undefined) {
            game.currentBoss.phase = data.phase;
        }
    }
}

function updatePlayerHealthUI(health) {
    if (!game.player) return;
    
    const maxHealth = game.player.stats.maxHealth;
    const percentage = (health / maxHealth) * 100;
    
    // Update fill
    const healthFill = document.getElementById('health-fill');
    if (healthFill) {
        healthFill.style.width = `${percentage}%`;
    }
    
    // Update text
    const healthText = document.getElementById('player-health-text');
    if (healthText) {
        healthText.textContent = `${health}/${maxHealth}`;
    }
}

function updateBossHealthUI() {
    if (!game.currentBoss) return;
    
    const boss = game.currentBoss;
    const percentage = (boss.health / boss.maxHealth) * 100;
    
    // Show boss container
    const bossContainer = document.getElementById('boss-container');
    if (bossContainer) {
        bossContainer.classList.remove('hidden');
    }
    
    // Update name
    const bossName = document.getElementById('boss-name');
    if (bossName) {
        bossName.textContent = boss.name;
    }
    
    // Update fill
    const bossFill = document.getElementById('boss-health-fill');
    if (bossFill) {
        bossFill.style.width = `${percentage}%`;
    }
}

function showNotification(message, duration = 3000) {
    const pickupMessage = document.getElementById('pickup-message');
    if (pickupMessage) {
        pickupMessage.textContent = message;
        pickupMessage.style.opacity = '1';
        
        // Hide after duration
        setTimeout(() => {
            pickupMessage.style.opacity = '0';
        }, duration);
    }
}

function showGameOver(data) {
    // Show game over screen
    showScreen('gameover');
    
    // Update stats
    document.getElementById('rooms-cleared').textContent = data.roomsCleared || 0;
    
    // Get player stats
    const playerStats = data.playerStats ? data.playerStats[playerID] : null;
    
    if (playerStats) {
        document.getElementById('enemies-killed').textContent = playerStats.kills || 0;
        document.getElementById('damage-dealt').textContent = playerStats.damageDealt || 0;
    }
}

// Start the game when loaded
window.addEventListener('load', init);

// Make key objects globally available for debugging
window.gameState = gameState;
window.game = game;
window.scene = scene;
window.camera = camera;
window.renderer = renderer;