import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import io from 'socket.io-client';
import Game from './core/game.js';
import Player from './entities/player.js';
import Enemy from './entities/enemy.js';
import { initializeMobileSupport, setupMobileControls } from './core/mobile.js';

// Main game variables
let scene, camera, renderer, controls;
let game;
let socket;
let playerID;
let playerEntities = {};
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Connection to server
const SERVER_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : window.location.origin;

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
    
    // Connect to server
    connectToServer();
    
    // Start animation loop
    animate();
    
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

function connectToServer() {
    socket = io(SERVER_URL);
    
    // Handle connection events
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        playerID = socket.id;
        
        // Join game
        socket.emit('joinGame', {
            id: playerID,
            name: 'Player_' + playerID.substring(0, 5),
            isMobile: isMobile
        });
    });
    
    // Handle server events
    socket.on('gameJoined', (data) => {
        console.log('Joined game:', data);
        setupLocalPlayer(data.player);
        
        // Add existing players
        for (const otherPlayer of data.players) {
            if (otherPlayer.id !== playerID) {
                addRemotePlayer(otherPlayer);
            }
        }
        
        // Load initial room
        game.loadRoom(data.room);
    });
    
    socket.on('playerJoined', (player) => {
        console.log('Player joined:', player);
        if (player.id !== playerID) {
            addRemotePlayer(player);
        }
    });
    
    socket.on('playerLeft', (id) => {
        console.log('Player left:', id);
        removePlayer(id);
    });
    
    socket.on('playerMoved', (data) => {
        updateRemotePlayer(data);
    });
    
    socket.on('bossUpdate', (data) => {
        updateBoss(data);
    });
    
    socket.on('roomComplete', (data) => {
        console.log('Room completed:', data);
        game.loadRoom(data.nextRoom);
    });
    
    socket.on('gameOver', (data) => {
        console.log('Game over:', data);
        game.stop();
        showGameOver(data);
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

function setupLocalPlayer(playerData) {
    // Create local player
    const player = new Player(playerID, playerData.type || 0, game);
    player.setName(playerData.name);
    player.setLocalPlayer(true);
    
    // Add player to scene and game
    scene.add(player.mesh);
    game.addEntity(player);
    
    // Store player reference
    game.player = player;
    playerEntities[playerID] = player;
    
    // Setup player movement
    setupPlayerControls(player);
    
    // Setup camera follow
    setupCameraFollow(player);
    
    // Start game
    game.start();
}

function setupPlayerControls(player) {
    // Keyboard controls
    const keysPressed = {};
    
    window.addEventListener('keydown', (event) => {
        keysPressed[event.code] = true;
    });
    
    window.addEventListener('keyup', (event) => {
        keysPressed[event.code] = false;
    });
    
    // Update loop for controls
    function updateControls() {
        if (!game.running) return;
        
        const moveSpeed = settings.movementSpeed * 0.1;
        const rotateSpeed = settings.rotationSpeed * 0.03;
        
        // Forward/backward
        if (keysPressed['KeyW'] || keysPressed['ArrowUp']) {
            player.moveForward(moveSpeed);
        }
        if (keysPressed['KeyS'] || keysPressed['ArrowDown']) {
            player.moveForward(-moveSpeed);
        }
        
        // Left/right
        if (keysPressed['KeyA'] || keysPressed['ArrowLeft']) {
            player.moveRight(-moveSpeed);
        }
        if (keysPressed['KeyD'] || keysPressed['ArrowRight']) {
            player.moveRight(moveSpeed);
        }
        
        // Rotation
        if (keysPressed['KeyQ']) {
            player.rotate(-rotateSpeed);
        }
        if (keysPressed['KeyE']) {
            player.rotate(rotateSpeed);
        }
        
        // Attack
        if (keysPressed['Space']) {
            player.attack();
        }
        
        // Send position update to server if moved
        if (player.hasMoved) {
            socket.emit('playerMove', {
                id: playerID,
                position: {
                    x: player.mesh.position.x,
                    y: player.mesh.position.y,
                    z: player.mesh.position.z
                },
                rotation: {
                    y: player.mesh.rotation.y
                },
                action: player.currentAction
            });
            player.hasMoved = false;
        }
        
        // Continue the control loop
        requestAnimationFrame(updateControls);
    }
    
    // Start the control loop
    updateControls();
    
    // Add mobile controls if on mobile
    if (isMobile) {
        setupMobileControls(player);
    }
}

function setupMobileControls(player) {
    console.log('Setting up mobile controls');
    
    // Create virtual joystick container
    const joystickContainer = document.createElement('div');
    joystickContainer.id = 'joystick-container';
    joystickContainer.style.position = 'absolute';
    joystickContainer.style.bottom = '20px';
    joystickContainer.style.left = '20px';
    joystickContainer.style.width = '120px';
    joystickContainer.style.height = '120px';
    joystickContainer.style.borderRadius = '60px';
    joystickContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.5)';
    document.body.appendChild(joystickContainer);
    
    // Create joystick
    const joystick = document.createElement('div');
    joystick.id = 'joystick';
    joystick.style.position = 'absolute';
    joystick.style.top = '35px';
    joystick.style.left = '35px';
    joystick.style.width = '50px';
    joystick.style.height = '50px';
    joystick.style.borderRadius = '25px';
    joystick.style.backgroundColor = 'rgba(100, 100, 100, 0.8)';
    joystickContainer.appendChild(joystick);
    
    // Create attack button
    const attackButton = document.createElement('div');
    attackButton.id = 'attack-button';
    attackButton.style.position = 'absolute';
    attackButton.style.bottom = '20px';
    attackButton.style.right = '20px';
    attackButton.style.width = '80px';
    attackButton.style.height = '80px';
    attackButton.style.borderRadius = '40px';
    attackButton.style.backgroundColor = 'rgba(200, 50, 50, 0.7)';
    attackButton.style.display = 'flex';
    attackButton.style.justifyContent = 'center';
    attackButton.style.alignItems = 'center';
    attackButton.style.fontSize = '20px';
    attackButton.style.color = 'white';
    attackButton.textContent = 'Attack';
    document.body.appendChild(attackButton);
    
    // Joystick variables
    let joystickActive = false;
    let joystickOrigin = { x: 0, y: 0 };
    let joystickPosition = { x: 0, y: 0 };
    
    // Joystick touch events
    joystickContainer.addEventListener('touchstart', (event) => {
        joystickActive = true;
        
        const touch = event.touches[0];
        const rect = joystickContainer.getBoundingClientRect();
        
        joystickOrigin.x = rect.left + rect.width / 2;
        joystickOrigin.y = rect.top + rect.height / 2;
        
        joystickPosition.x = touch.clientX;
        joystickPosition.y = touch.clientY;
        
        updateJoystickPosition();
    });
    
    document.addEventListener('touchmove', (event) => {
        if (!joystickActive) return;
        
        const touch = event.touches[0];
        joystickPosition.x = touch.clientX;
        joystickPosition.y = touch.clientY;
        
        updateJoystickPosition();
    });
    
    document.addEventListener('touchend', () => {
        joystickActive = false;
        joystick.style.top = '35px';
        joystick.style.left = '35px';
    });
    
    // Update joystick position and move player
    function updateJoystickPosition() {
        const dx = joystickPosition.x - joystickOrigin.x;
        const dy = joystickPosition.y - joystickOrigin.y;
        
        // Limit joystick movement radius
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = 35;
        
        if (distance > maxRadius) {
            joystickPosition.x = joystickOrigin.x + (dx / distance) * maxRadius;
            joystickPosition.y = joystickOrigin.y + (dy / distance) * maxRadius;
        }
        
        // Update joystick element position
        const joystickLeft = joystickPosition.x - joystickOrigin.x + 35;
        const joystickTop = joystickPosition.y - joystickOrigin.y + 35;
        
        joystick.style.left = joystickLeft + 'px';
        joystick.style.top = joystickTop + 'px';
        
        // Move player based on joystick position
        const normalizedX = dx / maxRadius;
        const normalizedY = dy / maxRadius;
        
        const moveSpeed = settings.movementSpeed * 0.05;
        
        if (Math.abs(normalizedY) > 0.1) {
            player.moveForward(-normalizedY * moveSpeed);
        }
        
        if (Math.abs(normalizedX) > 0.1) {
            player.moveRight(normalizedX * moveSpeed);
        }
        
        // Send position update to server
        if (player.hasMoved) {
            socket.emit('playerMove', {
                id: playerID,
                position: {
                    x: player.mesh.position.x,
                    y: player.mesh.position.y,
                    z: player.mesh.position.z
                },
                rotation: {
                    y: player.mesh.rotation.y
                },
                action: player.currentAction
            });
            player.hasMoved = false;
        }
    }
    
    // Attack button events
    attackButton.addEventListener('touchstart', () => {
        player.attack();
    });
}

function setupCameraFollow(player) {
    // Disable orbit controls
    controls.enabled = false;
    
    // Set up camera to follow player
    function updateCamera() {
        if (!game.running) return;
        
        // Position camera behind player
        const offset = new THREE.Vector3(0, 3, 5);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), player.mesh.rotation.y);
        
        camera.position.x = player.mesh.position.x + offset.x;
        camera.position.y = player.mesh.position.y + offset.y;
        camera.position.z = player.mesh.position.z + offset.z;
        
        // Look at player
        camera.lookAt(
            player.mesh.position.x,
            player.mesh.position.y + 1,
            player.mesh.position.z
        );
        
        requestAnimationFrame(updateCamera);
    }
    
    updateCamera();
}

function addRemotePlayer(playerData) {
    // Create remote player
    const player = new Player(playerData.id, playerData.type || 0, game);
    player.setName(playerData.name);
    
    // Set initial position if provided
    if (playerData.position) {
        player.mesh.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
    }
    
    // Set initial rotation if provided
    if (playerData.rotation) {
        player.mesh.rotation.y = playerData.rotation.y;
    }
    
    // Add player to scene and game
    scene.add(player.mesh);
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
        scene.remove(player.mesh);
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
            player.mesh.position.set(
                data.position.x,
                data.position.y,
                data.position.z
            );
        }
        
        // Update rotation
        if (data.rotation) {
            player.mesh.rotation.y = data.rotation.y;
        }
        
        // Update action
        if (data.action) {
            player.setAction(data.action);
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
            // Update health bar if it exists
            if (game.currentBoss.updateHealthBar) {
                game.currentBoss.updateHealthBar();
            }
        }
        
        // Update phase
        if (data.phase !== undefined) {
            game.currentBoss.setPhase(data.phase);
        }
        
        // Update action
        if (data.action) {
            game.currentBoss.setAction(data.action);
        }
    }
}

function showGameOver(data) {
    // Create game over screen
    const gameOverDiv = document.createElement('div');
    gameOverDiv.style.position = 'absolute';
    gameOverDiv.style.top = '0';
    gameOverDiv.style.left = '0';
    gameOverDiv.style.width = '100%';
    gameOverDiv.style.height = '100%';
    gameOverDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    gameOverDiv.style.display = 'flex';
    gameOverDiv.style.flexDirection = 'column';
    gameOverDiv.style.justifyContent = 'center';
    gameOverDiv.style.alignItems = 'center';
    gameOverDiv.style.color = 'white';
    gameOverDiv.style.fontSize = '24px';
    gameOverDiv.style.fontFamily = 'Arial, sans-serif';
    gameOverDiv.style.zIndex = '1000';
    
    // Add game over text
    const gameOverText = document.createElement('h1');
    gameOverText.textContent = 'Game Over';
    gameOverText.style.marginBottom = '20px';
    gameOverDiv.appendChild(gameOverText);
    
    // Add stats
    const statsText = document.createElement('div');
    statsText.innerHTML = `Rooms Cleared: ${data.roomsCleared}<br>`;
    
    if (data.playerStats) {
        statsText.innerHTML += `Damage Dealt: ${data.playerStats.damageDealt || 0}<br>`;
        statsText.innerHTML += `Damage Taken: ${data.playerStats.damageTaken || 0}<br>`;
    }
    
    gameOverDiv.appendChild(statsText);
    
    // Add restart button
    const restartButton = document.createElement('button');
    restartButton.textContent = 'Restart Game';
    restartButton.style.marginTop = '30px';
    restartButton.style.padding = '10px 20px';
    restartButton.style.fontSize = '18px';
    restartButton.style.cursor = 'pointer';
    restartButton.style.backgroundColor = '#5555ff';
    restartButton.style.border = 'none';
    restartButton.style.borderRadius = '5px';
    restartButton.style.color = 'white';
    
    restartButton.addEventListener('click', () => {
        window.location.reload();
    });
    
    gameOverDiv.appendChild(restartButton);
    document.body.appendChild(gameOverDiv);
}

// Start the game when loaded
window.addEventListener('load', init);

// Make key objects globally available for debugging
window.gameState = gameState;
window.game = game;
window.scene = scene;
window.camera = camera;
window.renderer = renderer;