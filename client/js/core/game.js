import * as THREE from 'three';
import Boss from '../entities/boss.js';

// Main Game class - core engine for the game
export default class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.entities = [];
        this.running = false;
        this.debug = false;
        this.isMobile = false;
        
        // Room management
        this.currentRoom = null;
        this.roomsCleared = 0;
        
        // Player references
        this.player = null;
        this.otherPlayers = {};
        
        // Boss reference
        this.currentBoss = null;
        
        // Callbacks
        this.onRoomComplete = null;
        this.onGameOver = null;
        this.onBossDefeated = null;
    }
    
    init(scene, camera, renderer, isMobile) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.isMobile = isMobile;
        
        console.log('Game engine initialized');
        
        // Initialize physics
        this.initPhysics();
        
        return this;
    }
    
    initPhysics() {
        // Simple collision system for now
        this.colliders = [];
        
        // We'll use simple sphere/box collisions for performance 
        console.log('Physics system initialized');
    }
    
    start() {
        this.running = true;
        this.clock.start();
        console.log('Game started');
        
        // Main game loop
        this.update();
    }
    
    pause() {
        this.running = false;
        console.log('Game paused');
    }
    
    resume() {
        if (!this.running) {
            this.running = true;
            this.update();
            console.log('Game resumed');
        }
    }
    
    stop() {
        this.running = false;
        this.entities = [];
        this.colliders = [];
        console.log('Game stopped');
    }
    
    update() {
        if (!this.running) return;
        
        // Get delta time
        const delta = this.clock.getDelta();
        
        // Update all entities
        for (const entity of this.entities) {
            if (entity.update) {
                entity.update(delta);
            }
        }
        
        // Check for collisions
        this.checkCollisions();
        
        // Call next frame if still running
        if (this.running) {
            requestAnimationFrame(() => this.update());
        }
    }
    
    checkCollisions() {
        // Very basic collision detection - can be optimized later with spatial partitioning
        for (let i = 0; i < this.colliders.length; i++) {
            const colliderA = this.colliders[i];
            
            // Skip if not active
            if (!colliderA.active) continue;
            
            for (let j = i + 1; j < this.colliders.length; j++) {
                const colliderB = this.colliders[j];
                
                // Skip if not active
                if (!colliderB.active) continue;
                
                // Skip if they're in the same group (e.g., player and player projectiles)
                if (colliderA.group && colliderB.group && colliderA.group === colliderB.group) continue;
                
                // Check collision based on type
                if (this.testCollision(colliderA, colliderB)) {
                    // Handle collision
                    if (colliderA.onCollision) colliderA.onCollision(colliderB);
                    if (colliderB.onCollision) colliderB.onCollision(colliderA);
                }
            }
        }
    }
    
    testCollision(a, b) {
        // Sphere-Sphere collision
        if (a.type === 'sphere' && b.type === 'sphere') {
            const distance = a.position.distanceTo(b.position);
            return distance < (a.radius + b.radius);
        }
        
        // Box-Box collision (AABB)
        if (a.type === 'box' && b.type === 'box') {
            return (
                a.min.x <= b.max.x && a.max.x >= b.min.x &&
                a.min.y <= b.max.y && a.max.y >= b.min.y &&
                a.min.z <= b.max.z && a.max.z >= b.min.z
            );
        }
        
        // Sphere-Box collision
        if ((a.type === 'sphere' && b.type === 'box') || (a.type === 'box' && b.type === 'sphere')) {
            const sphere = a.type === 'sphere' ? a : b;
            const box = a.type === 'box' ? a : b;
            
            // Find the closest point on the box to the sphere
            const closestPoint = new THREE.Vector3(
                Math.max(box.min.x, Math.min(sphere.position.x, box.max.x)),
                Math.max(box.min.y, Math.min(sphere.position.y, box.max.y)),
                Math.max(box.min.z, Math.min(sphere.position.z, box.max.z))
            );
            
            // Check if the closest point is within the sphere
            const distance = closestPoint.distanceTo(sphere.position);
            return distance < sphere.radius;
        }
        
        return false;
    }
    
    addEntity(entity) {
        this.entities.push(entity);
        
        // If entity has a collider, add it to colliders list
        if (entity.collider) {
            this.colliders.push(entity.collider);
        }
        
        // If entity has a mesh, add it to scene
        if (entity.mesh) {
            this.scene.add(entity.mesh);
        }
        
        return entity;
    }
    
    removeEntity(entity) {
        // Remove from entities list
        const index = this.entities.indexOf(entity);
        if (index !== -1) {
            this.entities.splice(index, 1);
        }
        
        // Remove collider if it exists
        if (entity.collider) {
            const colliderIndex = this.colliders.indexOf(entity.collider);
            if (colliderIndex !== -1) {
                this.colliders.splice(colliderIndex, 1);
            }
        }
        
        // Remove mesh from scene if it exists
        if (entity.mesh) {
            this.scene.remove(entity.mesh);
        }
    }
    
    // Room handling
    loadRoom(roomData) {
        console.log('Loading room:', roomData);
        
        // Clear existing room entities except player
        this.entities = this.entities.filter(entity => {
            const isPlayer = entity === this.player || Object.values(this.otherPlayers).includes(entity);
            
            if (!isPlayer && entity.mesh) {
                this.scene.remove(entity.mesh);
            }
            
            return isPlayer;
        });
        
        // Reset colliders except player
        this.colliders = this.colliders.filter(collider => {
            return collider.entity === this.player || 
                Object.values(this.otherPlayers).some(p => p.collider === collider);
        });
        
        // Create new room
        this.currentRoom = this.createRoom(roomData);
        
        // Reset player position
        if (this.player) {
            this.player.resetPosition();
        }
        
        // Spawn boss if it's provided
        if (roomData.boss) {
            this.spawnBoss(roomData.boss);
        }
        
        return this.currentRoom;
    }
    
    createRoom(roomData) {
        // Basic room structure - can be enhanced later
        const room = {
            data: roomData,
            entities: [],
            cleared: false
        };
        
        // Create floor
        const floorSize = 20;
        const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x333333, 
            roughness: 0.8 
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = !this.isMobile;
        this.scene.add(floor);
        
        // Create walls
        const wallHeight = 5;
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            color: this.getRoomColor(roomData.difficulty),
            roughness: 0.7 
        });
        
        // North wall
        const northWall = new THREE.Mesh(
            new THREE.BoxGeometry(floorSize, wallHeight, 0.5),
            wallMaterial
        );
        northWall.position.set(0, wallHeight/2, -floorSize/2);
        northWall.castShadow = !this.isMobile;
        this.scene.add(northWall);
        
        // South wall
        const southWall = new THREE.Mesh(
            new THREE.BoxGeometry(floorSize, wallHeight, 0.5),
            wallMaterial
        );
        southWall.position.set(0, wallHeight/2, floorSize/2);
        southWall.castShadow = !this.isMobile;
        this.scene.add(southWall);
        
        // East wall
        const eastWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, wallHeight, floorSize),
            wallMaterial
        );
        eastWall.position.set(floorSize/2, wallHeight/2, 0);
        eastWall.castShadow = !this.isMobile;
        this.scene.add(eastWall);
        
        // West wall
        const westWall = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, wallHeight, floorSize),
            wallMaterial
        );
        westWall.position.set(-floorSize/2, wallHeight/2, 0);
        westWall.castShadow = !this.isMobile;
        this.scene.add(westWall);
        
        // Create collision boxes for walls
        this.addWallCollider(northWall, 'north');
        this.addWallCollider(southWall, 'south');
        this.addWallCollider(eastWall, 'east');
        this.addWallCollider(westWall, 'west');
        
        // Add room decorations based on room type/difficulty
        this.addRoomDecorations(roomData);
        
        // Store meshes for later cleanup
        room.meshes = [floor, northWall, southWall, eastWall, westWall];
        
        return room;
    }
    
    addWallCollider(wallMesh, direction) {
        const size = new THREE.Vector3();
        const bbox = new THREE.Box3().setFromObject(wallMesh);
        bbox.getSize(size);
        
        const collider = {
            type: 'box',
            entity: wallMesh,
            min: bbox.min,
            max: bbox.max,
            active: true,
            group: 'environment',
            direction: direction
        };
        
        this.colliders.push(collider);
        return collider;
    }
    
    getRoomColor(difficulty) {
        // Different colors based on room difficulty
        const colors = [
            0x662211, // Basic
            0x883322, // Medium
            0xaa4433, // Hard
            0xcc6644, // Very Hard
            0xff8855  // Boss
        ];
        
        const index = Math.min(Math.floor(difficulty / 3), colors.length - 1);
        return colors[index];
    }
    
    addRoomDecorations(roomData) {
        // Base decoration on room type and difficulty
        const isBossRoom = roomData.boss != null;
        
        if (isBossRoom) {
            // Add boss room decorations
            this.addBossRoomDecorations(roomData);
        } else {
            // Add standard room decorations for non-boss room
            this.addStandardRoomDecorations(roomData);
        }
    }
    
    addBossRoomDecorations(roomData) {
        // Add a central platform for the boss
        const platformGeometry = new THREE.CylinderGeometry(5, 5, 0.5, 16);
        const platformMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x770000, 
            roughness: 0.6 
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.set(0, 0.25, 0);
        platform.receiveShadow = !this.isMobile;
        this.scene.add(platform);
        
        // Add some pillars around the room
        const pillarGeometry = new THREE.CylinderGeometry(0.5, 0.5, 4, 8);
        const pillarMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x550000, 
            roughness: 0.7 
        });
        
        const pillarPositions = [
            [-8, 2, -8],
            [8, 2, -8],
            [-8, 2, 8],
            [8, 2, 8]
        ];
        
        for (const pos of pillarPositions) {
            const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
            pillar.position.set(...pos);
            pillar.castShadow = !this.isMobile;
            this.scene.add(pillar);
            
            // Add collider
            const bbox = new THREE.Box3().setFromObject(pillar);
            const collider = {
                type: 'box',
                entity: pillar,
                min: bbox.min,
                max: bbox.max,
                active: true,
                group: 'environment'
            };
            this.colliders.push(collider);
        }
        
        // Add some atmospheric lights
        const lightColor = 0xff2200;
        const intensity = 1;
        const distance = 10;
        
        for (const pos of pillarPositions) {
            const light = new THREE.PointLight(lightColor, intensity, distance);
            light.position.set(pos[0], 3, pos[2]);
            this.scene.add(light);
        }
    }
    
    addStandardRoomDecorations(roomData) {
        // Add some random debris and props to non-boss rooms
        // In the future, this could be a lobby or preparation room
        
        const debrisGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const debrisMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x666666, 
            roughness: 0.9 
        });
        
        const numDebris = 5 + Math.floor(Math.random() * 10);
        
        for (let i = 0; i < numDebris; i++) {
            const debris = new THREE.Mesh(debrisGeometry, debrisMaterial);
            debris.position.set(
                (Math.random() - 0.5) * 18,
                0.25,
                (Math.random() - 0.5) * 18
            );
            debris.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );
            debris.scale.set(
                1 + Math.random(),
                1 + Math.random(),
                1 + Math.random()
            );
            debris.castShadow = !this.isMobile;
            this.scene.add(debris);
            
            // Add small collider
            const bbox = new THREE.Box3().setFromObject(debris);
            const collider = {
                type: 'box',
                entity: debris,
                min: bbox.min,
                max: bbox.max,
                active: true,
                group: 'environment'
            };
            this.colliders.push(collider);
        }
        
        // Maybe add a table or some props
        if (Math.random() > 0.5) {
            const tableGeometry = new THREE.BoxGeometry(2, 1, 1);
            const tableMaterial = new THREE.MeshStandardMaterial({ 
                color: 0x442200, 
                roughness: 0.8 
            });
            const table = new THREE.Mesh(tableGeometry, tableMaterial);
            table.position.set(
                (Math.random() - 0.5) * 15,
                0.5,
                (Math.random() - 0.5) * 15
            );
            table.castShadow = !this.isMobile;
            this.scene.add(table);
            
            // Add collider
            const bbox = new THREE.Box3().setFromObject(table);
            const collider = {
                type: 'box',
                entity: table,
                min: bbox.min,
                max: bbox.max,
                active: true,
                group: 'environment'
            };
            this.colliders.push(collider);
        }
    }
    
    spawnBoss(bossData) {
        // Create a boss instance
        const boss = new Boss(bossData.id, bossData.type || 0, this);
        
        // Set position if provided
        if (bossData.position) {
            boss.mesh.position.set(
                bossData.position.x || 0,
                bossData.position.y || 1.5,
                bossData.position.z || 0
            );
        }
        
        // Set health if provided
        if (bossData.health) {
            boss.health = bossData.health;
            boss.maxHealth = bossData.maxHealth || bossData.health;
        }
        
        // Add to scene and game
        this.scene.add(boss.mesh);
        this.addEntity(boss);
        
        // Store reference to current boss
        this.currentBoss = boss;
        
        // Setup boss defeat callback
        boss.onBossDefeated = () => this.handleBossDefeated(boss);
        
        return boss;
    }
    
    handleBossDefeated(boss) {
        // Handle boss defeat
        console.log(`Boss ${boss.name} has been defeated!`);
        
        // Clear boss reference
        this.currentBoss = null;
        
        // Increment room counter
        this.roomsCleared++;
        
        // Trigger room complete callback
        if (this.onRoomComplete) {
            this.onRoomComplete(this.roomsCleared);
        }
        
        // Notify custom callback if provided
        if (this.onBossDefeated) {
            this.onBossDefeated(boss);
        }
    }
    
    announceMessage(message) {
        // Display an announcement to players
        // This would be implemented in the UI
        console.log("ANNOUNCEMENT:", message);
    }
    
    updatePlayerHealth(health) {
        // Update player health in UI
        // This would be implemented by the UI layer
        console.log("Player health updated:", health);
    }
    
    triggerGameOver() {
        this.running = false;
        
        if (this.onGameOver) {
            this.onGameOver({
                roomsCleared: this.roomsCleared,
                playerStats: this.player ? this.player.stats : null
            });
        }
    }
} 