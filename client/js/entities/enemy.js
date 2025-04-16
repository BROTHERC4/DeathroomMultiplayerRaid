import * as THREE from 'three';

export default class Enemy {
    constructor(id, type, game) {
        // Basic properties
        this.id = id;
        this.type = type || 0; // 0-2 for different enemy types
        this.game = game;
        this.mesh = null;
        this.collider = null;
        
        // Movement and AI properties
        this.moveSpeed = 2.0 + (this.type * 0.5); // Different speeds based on type
        this.targetPosition = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lastPathfindTime = 0;
        this.pathfindInterval = 1.0; // How often to recalculate path
        
        // Combat properties
        this.attackCooldown = 0;
        this.attackDamage = 5 + (this.type * 3);
        this.attackRange = 1.5;
        this.attackSpeed = 0.8 + (this.type * 0.2); // Attacks per second
        
        // Stats
        this.health = 50 + (this.type * 25);
        this.maxHealth = 50 + (this.type * 25);
        
        // Animation state
        this.animationState = 'idle';
        
        // Create the enemy mesh and collider
        this.createMesh();
    }
    
    createMesh() {
        // Create a simple enemy representation based on type
        let geometry, material;
        
        // Different enemy types have different appearances
        switch(this.type) {
            case 0: // Basic enemy - red cube
                geometry = new THREE.BoxGeometry(1, 1.8, 1);
                material = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
                break;
            case 1: // Medium enemy - red cylinder
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
                material = new THREE.MeshLambertMaterial({ color: 0xcc5522 });
                break;
            case 2: // Advanced enemy - red tetrahedron
                geometry = new THREE.ConeGeometry(0.7, 2, 4);
                material = new THREE.MeshLambertMaterial({ color: 0xcc0000 });
                break;
            default:
                geometry = new THREE.BoxGeometry(1, 1.8, 1);
                material = new THREE.MeshLambertMaterial({ color: 0xcc3333 });
        }
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.position.y = 1; // Floating 1 unit above ground
        
        // Create a simple sphere collider for the enemy
        this.collider = {
            type: 'sphere',
            entity: this,
            position: new THREE.Vector3(),
            radius: 0.75,
            active: true,
            group: 'enemy',
            onCollision: (other) => this.handleCollision(other)
        };
        
        return this.mesh;
    }
    
    update(delta) {
        if (!this.mesh || this.health <= 0) return;
        
        // Find the closest player to target
        this.findTarget();
        
        // Update pathfinding
        this.updatePathfinding(delta);
        
        // Move towards target
        this.updateMovement(delta);
        
        // Update attack cooldown
        if (this.attackCooldown > 0) {
            this.attackCooldown -= delta;
        }
        
        // Update collider position
        this.updateCollider();
        
        // Attempt attack if in range
        this.attemptAttack();
    }
    
    findTarget() {
        // Find the nearest player
        const closestPlayer = this.findClosestPlayer();
        
        if (closestPlayer) {
            // Set target position
            this.targetPosition.copy(closestPlayer.yawObject.position);
        }
    }
    
    findClosestPlayer() {
        if (!this.game || !this.game.player) return null;
        
        // Check local player first (most common target)
        let closestPlayer = this.game.player;
        let closestDistance = this.mesh.position.distanceToSquared(closestPlayer.yawObject.position);
        
        // Check distance to other players
        for (const playerId in this.game.otherPlayers) {
            const player = this.game.otherPlayers[playerId];
            const distance = this.mesh.position.distanceToSquared(player.yawObject.position);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPlayer = player;
            }
        }
        
        return closestPlayer;
    }
    
    updatePathfinding(delta) {
        // Simple pathfinding - just update target periodically
        this.lastPathfindTime += delta;
        
        if (this.lastPathfindTime >= this.pathfindInterval) {
            this.lastPathfindTime = 0;
            
            // Check for obstacles in the path
            // This is a very simple implementation
            // A more advanced version would use A* or navmesh
            
            // For now just make sure we're not targeting a position inside a wall
            this.adjustTargetForObstacles();
        }
    }
    
    adjustTargetForObstacles() {
        // Simplified obstacle avoidance
        // Cast rays in a few directions to find clear paths
        
        // For simplicity, we'll just clamp to room bounds
        const bounds = 9; // Room size - 1 unit buffer
        
        this.targetPosition.x = Math.max(-bounds, Math.min(bounds, this.targetPosition.x));
        this.targetPosition.z = Math.max(-bounds, Math.min(bounds, this.targetPosition.z));
    }
    
    updateMovement(delta) {
        // Direction to target
        const direction = new THREE.Vector3().subVectors(this.targetPosition, this.mesh.position);
        
        // Distance to target
        const distance = direction.length();
        
        // If we're far enough away, move towards target
        if (distance > this.attackRange) {
            // Normalize direction and apply speed
            direction.normalize().multiplyScalar(this.moveSpeed * delta);
            
            // Apply movement
            this.mesh.position.add(direction);
            
            // Face towards movement direction
            if (direction.length() > 0.01) {
                this.mesh.lookAt(this.targetPosition);
                
                // Keep enemy upright
                this.mesh.rotation.x = 0;
                this.mesh.rotation.z = 0;
                
                // Set animation state
                this.animationState = 'running';
            }
        } else {
            // In attack range, stop and attack
            this.animationState = 'attacking';
        }
    }
    
    updateCollider() {
        // Update collider position to follow the mesh
        this.collider.position.copy(this.mesh.position);
    }
    
    attemptAttack() {
        // Only attack if we're in range and cooled down
        if (this.attackCooldown <= 0) {
            const closestPlayer = this.findClosestPlayer();
            
            if (closestPlayer) {
                const distance = this.mesh.position.distanceTo(closestPlayer.yawObject.position);
                
                if (distance <= this.attackRange) {
                    this.attack(closestPlayer);
                }
            }
        }
    }
    
    attack(player) {
        // Set cooldown
        this.attackCooldown = 1.0 / this.attackSpeed;
        
        // Animation
        this.animationState = 'attacking';
        
        // Deal damage to player
        if (player && player.takeDamage) {
            // In multiplayer, this would be handled by the server
            if (this.game.isMultiplayer) {
                // Send attack event to server
                if (window.socket) {
                    window.socket.emit('enemyAttacked', {
                        enemyId: this.id,
                        playerId: player.id,
                        damage: this.attackDamage
                    });
                }
            } else {
                // Direct damage in single player
                player.takeDamage(this.attackDamage);
                
                // Update UI
                if (this.game.updatePlayerHealth) {
                    this.game.updatePlayerHealth(player.stats.health);
                }
            }
        }
    }
    
    takeDamage(amount) {
        // Reduce health
        this.health = Math.max(0, this.health - amount);
        
        // Check if enemy died
        if (this.health <= 0) {
            this.die();
        }
        
        // Flash the enemy to show damage
        this.showDamageIndicator();
        
        // Return current health
        return this.health;
    }
    
    showDamageIndicator() {
        // Flash the enemy red and back
        if (!this.mesh) return;
        
        const material = this.mesh.material;
        const originalColor = material.color.clone();
        
        // Flash white
        material.color.set(0xffffff);
        
        // Return to original color after 100ms
        setTimeout(() => {
            if (this.mesh && !this.isDead) {
                material.color.copy(originalColor);
            }
        }, 100);
    }
    
    die() {
        // Set state
        this.isDead = true;
        this.animationState = 'dying';
        
        // Make collider inactive
        if (this.collider) {
            this.collider.active = false;
        }
        
        // Play death animation
        this.playDeathAnimation();
        
        // Drop loot
        this.dropLoot();
    }
    
    playDeathAnimation() {
        // Simple falling animation
        if (!this.mesh) return;
        
        // Tween the mesh to fall over
        const fallDuration = 0.5;
        const startRotation = this.mesh.rotation.x;
        const startHeight = this.mesh.position.y;
        
        // Use a simple animation function
        const startTime = performance.now() / 1000;
        
        const animatefall = () => {
            if (!this.mesh) return;
            
            const now = performance.now() / 1000;
            const elapsed = now - startTime;
            const progress = Math.min(1.0, elapsed / fallDuration);
            
            // Fall over
            this.mesh.rotation.x = startRotation + progress * (Math.PI / 2);
            
            // Sink into ground
            this.mesh.position.y = startHeight - progress * 0.5;
            
            // Continue animation if not done
            if (progress < 1.0) {
                requestAnimationFrame(animatefall);
            } else {
                // Fade out and remove after death animation
                setTimeout(() => this.remove(), 1000);
            }
        };
        
        // Start animation
        animatefall();
    }
    
    dropLoot() {
        // Chance to drop health or other pickups
        // This would be handled by the server in multiplayer
        
        // For now, just a placeholder
        console.log(`Enemy ${this.id} would drop loot here`);
    }
    
    remove() {
        // Remove from scene if mesh still exists
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        
        // Null references for garbage collection
        this.mesh = null;
    }
    
    handleCollision(other) {
        // Handle collisions with different entities
        if (other.group === 'environment') {
            // Collision with walls or obstacles
            this.handleEnvironmentCollision(other);
        }
    }
    
    handleEnvironmentCollision(other) {
        // Simple collision response
        if (other.type === 'box') {
            // Push away from the wall
            const closestPoint = new THREE.Vector3(
                Math.max(other.min.x, Math.min(this.collider.position.x, other.max.x)),
                Math.max(other.min.y, Math.min(this.collider.position.y, other.max.y)),
                Math.max(other.min.z, Math.min(this.collider.position.z, other.max.z))
            );
            
            // Direction and distance
            const directionVector = new THREE.Vector3().subVectors(this.collider.position, closestPoint);
            const distance = directionVector.length();
            
            if (distance < this.collider.radius) {
                directionVector.normalize();
                
                // Push out of the obstacle
                const pushDistance = this.collider.radius - distance;
                this.mesh.position.add(directionVector.multiplyScalar(pushDistance));
                
                // Update collider
                this.updateCollider();
            }
        }
    }
} 