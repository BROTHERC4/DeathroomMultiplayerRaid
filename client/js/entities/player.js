import * as THREE from 'three';

export default class Player {
    constructor(id, isLocal = false) {
        // Basic properties
        this.id = id;
        this.isLocal = isLocal;
        this.mesh = null;
        this.collider = null;
        
        // Movement and control properties
        this.moveSpeed = 5.0;
        this.yawObject = new THREE.Object3D(); // For rotation around Y axis
        this.pitchObject = new THREE.Object3D(); // For looking up/down
        this.velocity = new THREE.Vector3();
        this.moveState = {
            forward: false,
            backward: false,
            left: false,
            right: false
        };
        this.moveAnalog = { x: 0, y: 0 }; // For mobile analog controls
        
        // Combat properties
        this.attackCooldown = 0;
        this.attackDamage = 10;
        this.attackRange = 2.5;
        this.attackSpeed = 1.0; // Attacks per second
        
        // Player stats
        this.stats = {
            health: 100,
            maxHealth: 100,
            kills: 0,
            level: 1,
            damageDealt: 0
        };
        
        // Animation state
        this.animationState = 'idle';
        
        // Create the player mesh and collider
        this.createMesh();
    }
    
    createMesh() {
        // Create a simple player representation (a capsule)
        const geometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8);
        
        // Different color for local vs. remote players
        const color = this.isLocal ? 0x00ff00 : 0xff6600;
        
        const material = new THREE.MeshLambertMaterial({ color });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        
        // Set up the player hierarchy
        this.yawObject.position.y = 1.8; // Player eye height
        this.yawObject.add(this.pitchObject);
        
        // Add mesh to the rotation hierarchy
        if (this.isLocal) {
            // For local player, add mesh to pitch object (camera will be added later)
            this.pitchObject.add(this.mesh);
            this.mesh.position.set(0, -1.8, -0.5); // Positioned relative to camera
        } else {
            // For remote players, add mesh directly to yaw object
            this.yawObject.add(this.mesh);
            this.mesh.position.y = -1; // Offset down from center
        }
        
        // Create a simple sphere collider for the player
        this.collider = {
            type: 'sphere',
            entity: this,
            position: new THREE.Vector3(),
            radius: 0.75, // Slightly larger than visual model
            active: true,
            group: 'player', // Use 'localPlayer' or 'remotePlayer' if needed
            onCollision: (other) => this.handleCollision(other)
        };
        
        return this.mesh;
    }
    
    update(delta) {
        if (!this.mesh) return;
        
        // Update collider position
        this.updateCollider();
        
        // Only process movement for local player
        if (this.isLocal) {
            this.updateMovement(delta);
        }
        
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= delta;
        }
    }
    
    updateMovement(delta) {
        // Calculate base movement direction
        let moveX = 0;
        let moveZ = 0;
        
        // Handle keyboard input
        if (this.moveState.right) moveX += 1;
        if (this.moveState.left) moveX -= 1;
        if (this.moveState.backward) moveZ += 1;
        if (this.moveState.forward) moveZ -= 1;
        
        // Handle mobile analog input if available
        if (window.isMobile && (this.moveAnalog.x !== 0 || this.moveAnalog.y !== 0)) {
            moveX = -this.moveAnalog.x;
            moveZ = -this.moveAnalog.y;
        }
        
        // Calculate velocity
        this.velocity.x = moveX * this.moveSpeed;
        this.velocity.z = moveZ * this.moveSpeed;
        
        // Rotate velocity based on camera direction
        if (Math.abs(this.velocity.x) > 0.01 || Math.abs(this.velocity.z) > 0.01) {
            // Clone velocity before rotating
            const rotatedVelocity = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
            // Apply yaw rotation
            rotatedVelocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yawObject.rotation.y);
            
            // Move player
            this.yawObject.position.x += rotatedVelocity.x * delta;
            this.yawObject.position.z += rotatedVelocity.z * delta;
            
            // Set animation state
            this.animationState = 'running';
        } else {
            // Player is not moving
            this.animationState = 'idle';
        }
    }
    
    updateCollider() {
        // Update the sphere collider to follow the player
        this.collider.position.copy(this.yawObject.position);
    }
    
    handleCollision(other) {
        // Handle collisions with different entities
        if (other.group === 'environment') {
            // Collision with walls or obstacles - implement sliding/blocking
            this.handleEnvironmentCollision(other);
        } else if (other.group === 'enemy') {
            // Collision with enemies
            // This could trigger damage or knockback
        } else if (other.group === 'pickup') {
            // Collision with pickups/loot
            // This could trigger item collection
        }
    }
    
    handleEnvironmentCollision(other) {
        // Simple collision response - move player out of the obstacle
        if (other.type === 'box') {
            // Get the closest point on the box to the player
            const closestPoint = new THREE.Vector3(
                Math.max(other.min.x, Math.min(this.collider.position.x, other.max.x)),
                Math.max(other.min.y, Math.min(this.collider.position.y, other.max.y)),
                Math.max(other.min.z, Math.min(this.collider.position.z, other.max.z))
            );
            
            // Calculate direction and distance
            const directionVector = new THREE.Vector3().subVectors(this.collider.position, closestPoint);
            const distance = directionVector.length();
            
            // Only adjust if we're within the collision range
            if (distance < this.collider.radius) {
                directionVector.normalize();
                
                // Move player out of the obstacle
                const pushDistance = this.collider.radius - distance;
                this.yawObject.position.add(directionVector.multiplyScalar(pushDistance));
                
                // Update collider position
                this.updateCollider();
            }
        }
    }
    
    attack() {
        // Check cooldown
        if (this.attackCooldown > 0) return false;
        
        // Set cooldown based on attack speed
        this.attackCooldown = 1.0 / this.attackSpeed;
        
        // Play attack animation/sound
        this.animationState = 'attacking';
        
        // Calculate attack direction (where the player is looking)
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(this.pitchObject.quaternion);
        direction.applyQuaternion(this.yawObject.quaternion);
        
        // Create attack data for server/multiplayer
        const attackData = {
            position: this.yawObject.position.clone(),
            direction: direction,
            range: this.attackRange,
            damage: this.attackDamage
        };
        
        // Return attack data for processing
        return attackData;
    }
    
    takeDamage(amount) {
        // Reduce health
        this.stats.health = Math.max(0, this.stats.health - amount);
        
        // Check if player died
        if (this.stats.health <= 0) {
            this.die();
        }
        
        // Return current health
        return this.stats.health;
    }
    
    die() {
        // Handle player death
        this.animationState = 'dead';
        
        // Make collider inactive
        if (this.collider) {
            this.collider.active = false;
        }
    }
    
    heal(amount) {
        // Increase health up to max
        this.stats.health = Math.min(this.stats.maxHealth, this.stats.health + amount);
        return this.stats.health;
    }
    
    resetPosition() {
        // Reset player to starting position
        this.yawObject.position.set(0, 1.8, 0);
        
        // Reset rotation
        if (this.isLocal) {
            // Don't reset local player's camera rotation, it's disorienting
        } else {
            this.yawObject.rotation.y = 0;
            this.pitchObject.rotation.x = 0;
        }
        
        // Update collider
        this.updateCollider();
    }
    
    // For multiplayer - update remote player from network data
    updateFromNetworkData(data) {
        if (!this.isLocal && data) {
            // Update position if provided
            if (data.position) {
                this.yawObject.position.set(
                    data.position.x,
                    data.position.y,
                    data.position.z
                );
            }
            
            // Update rotation if provided
            if (data.rotation) {
                this.yawObject.rotation.y = data.rotation.y;
                if (this.pitchObject) {
                    this.pitchObject.rotation.x = data.rotation.x;
                }
            }
            
            // Update animation state if provided
            if (data.animationState) {
                this.animationState = data.animationState;
            }
            
            // Update collider
            this.updateCollider();
        }
    }
    
    // Get network data for sending to other players
    getNetworkData() {
        return {
            id: this.id,
            position: {
                x: this.yawObject.position.x,
                y: this.yawObject.position.y,
                z: this.yawObject.position.z
            },
            rotation: {
                y: this.yawObject.rotation.y,
                x: this.pitchObject ? this.pitchObject.rotation.x : 0
            },
            animationState: this.animationState,
            health: this.stats.health
        };
    }
} 