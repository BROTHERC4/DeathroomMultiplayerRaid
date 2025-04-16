import * as THREE from 'three';

export default class Boss {
    constructor(id, type, game) {
        // Basic properties
        this.id = id;
        this.type = type || 0; // 0-4 for different boss types
        this.name = this.getBossName(this.type);
        this.game = game;
        this.mesh = null;
        this.collider = null;
        
        // Movement and AI properties
        this.moveSpeed = 1.5 + (this.type * 0.3); // Slower but more powerful than regular enemies
        this.targetPosition = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.lastPathfindTime = 0;
        this.pathfindInterval = 1.0; // How often to recalculate path
        
        // Combat properties
        this.attackCooldown = 0;
        this.attackDamage = 15 + (this.type * 5);
        this.attackRange = 2.5;
        this.attackSpeed = 0.6 + (this.type * 0.1); // Attacks per second
        
        // Special attack properties
        this.specialAttackCooldown = 0;
        this.specialAttackInterval = 10; // Seconds between special attacks
        this.specialAttackDamage = 25 + (this.type * 8);
        this.specialAttackRange = 6;
        
        // Stats
        this.health = 200 + (this.type * 100);
        this.maxHealth = 200 + (this.type * 100);
        
        // Animation state
        this.animationState = 'idle';
        this.phaseTransition = false;
        
        // Phase tracking
        this.phase = 1; // Boss battles have phases
        this.phaseThresholds = [0.7, 0.4, 0.2]; // Health percentages where phase changes
        
        // Create the boss mesh and collider
        this.createMesh();
    }
    
    getBossName(type) {
        const names = [
            'Reanimated Executioner',
            'Blood Acolyte',
            'Pit Fiend',
            'Necrotic Hierophant',
            'Deathlord'
        ];
        
        return names[Math.min(type, names.length - 1)];
    }
    
    createMesh() {
        // Create a boss representation based on type
        let geometry, material;
        
        // Different boss types have different appearances
        switch(this.type) {
            case 0: // First boss - large red humanoid
                geometry = new THREE.CapsuleGeometry(1.2, 2.5, 8, 16);
                material = new THREE.MeshLambertMaterial({ color: 0xcc0000 });
                break;
            case 1: // Second boss - fiery elemental
                geometry = new THREE.SphereGeometry(1.5, 16, 16);
                material = new THREE.MeshLambertMaterial({ 
                    color: 0xff5500,
                    emissive: 0x441100,
                    emissiveIntensity: 0.5
                });
                break;
            case 2: // Third boss - demonic entity
                geometry = new THREE.ConeGeometry(1.2, 3, 5);
                material = new THREE.MeshLambertMaterial({ color: 0x990000 });
                break;
            case 3: // Fourth boss - undead priest
                geometry = new THREE.CylinderGeometry(0.8, 1.2, 3, 8);
                material = new THREE.MeshLambertMaterial({ color: 0x660066 });
                break;
            case 4: // Final boss - death incarnate
                geometry = new THREE.BoxGeometry(2, 3, 2);
                material = new THREE.MeshLambertMaterial({ 
                    color: 0x000000,
                    emissive: 0x330000,
                    emissiveIntensity: 1.0
                });
                break;
            default:
                geometry = new THREE.CapsuleGeometry(1.2, 2.5, 8, 16);
                material = new THREE.MeshLambertMaterial({ color: 0xcc0000 });
        }
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.position.y = 1.5; // Floating above ground
        
        // Add glowing eyes for intimidation
        this.addGlowingEyes();
        
        // Create a simple sphere collider for the boss
        this.collider = {
            type: 'sphere',
            entity: this,
            position: new THREE.Vector3(),
            radius: 1.5, // Larger than regular enemies
            active: true,
            group: 'boss',
            onCollision: (other) => this.handleCollision(other)
        };
        
        return this.mesh;
    }
    
    addGlowingEyes() {
        // Add glowing eyes to the boss
        const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        
        // Left eye
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.4, 0.7, 0.8);
        this.mesh.add(leftEye);
        
        // Right eye
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.4, 0.7, 0.8);
        this.mesh.add(rightEye);
        
        // Add point lights at the eyes
        const eyeLight = new THREE.PointLight(0xff0000, 0.5, 3);
        eyeLight.position.set(0, 0.7, 0.8);
        this.mesh.add(eyeLight);
    }
    
    update(delta) {
        if (!this.mesh || this.health <= 0) return;
        
        // Check phase transitions
        this.checkPhase();
        
        // If in phase transition, skip regular updates
        if (this.phaseTransition) return;
        
        // Find the target player
        this.findTarget();
        
        // Update pathfinding
        this.updatePathfinding(delta);
        
        // Move towards target
        this.updateMovement(delta);
        
        // Update attack cooldowns
        if (this.attackCooldown > 0) {
            this.attackCooldown -= delta;
        }
        
        if (this.specialAttackCooldown > 0) {
            this.specialAttackCooldown -= delta;
        } else {
            // Ready for special attack
            this.specialAttackCooldown = this.specialAttackInterval;
            this.performSpecialAttack();
        }
        
        // Update collider position
        this.updateCollider();
        
        // Attempt attack if in range
        this.attemptAttack();
    }
    
    checkPhase() {
        // Check if we should transition to a new phase
        const healthPercent = this.health / this.maxHealth;
        
        // If health is below threshold for current phase
        if (this.phase <= this.phaseThresholds.length && 
            healthPercent <= this.phaseThresholds[this.phase - 1] &&
            !this.phaseTransition) {
            
            // Start phase transition
            this.phaseTransition = true;
            this.phase++;
            
            // Perform phase transition effect
            this.performPhaseTransition();
        }
    }
    
    performPhaseTransition() {
        // Flash the boss
        if (!this.mesh) return;
        
        console.log(`Boss entering phase ${this.phase}`);
        
        // Play phase transition animation/effect
        this.animationState = 'phaseTransition';
        
        // Flash the boss
        const flashCount = 5;
        const flashDuration = 0.2;
        let currentFlash = 0;
        
        const flash = () => {
            if (currentFlash >= flashCount || !this.mesh) {
                // End transition
                this.phaseTransition = false;
                
                // Power up for new phase
                this.powerUpForNewPhase();
                return;
            }
            
            // Toggle visibility
            this.mesh.visible = !this.mesh.visible;
            
            // Schedule next flash
            setTimeout(() => {
                currentFlash++;
                flash();
            }, flashDuration * 1000);
        };
        
        // Start flashing
        flash();
    }
    
    powerUpForNewPhase() {
        // Power up the boss for the new phase
        this.attackDamage += 5;
        this.attackSpeed += 0.1;
        this.moveSpeed += 0.3;
        
        // Change color to indicate power increase
        if (this.mesh && this.mesh.material) {
            // Make the boss more intense in each phase
            const material = this.mesh.material;
            
            switch(this.phase) {
                case 2:
                    material.color.set(0xff0000); // Bright red
                    break;
                case 3:
                    material.color.set(0xff5500); // Fiery orange
                    material.emissive = new THREE.Color(0x330000);
                    material.emissiveIntensity = 0.3;
                    break;
                case 4:
                    material.color.set(0xff0066); // Demonic magenta
                    material.emissive = new THREE.Color(0x330033);
                    material.emissiveIntensity = 0.5;
                    break;
            }
        }
        
        // Announce phase change to players
        if (this.game && this.game.announceMessage) {
            this.game.announceMessage(`${this.name} enters phase ${this.phase}!`);
        }
    }
    
    findTarget() {
        // Boss targets the closest player by default
        // But has a chance to switch targets to make the fight more dynamic
        
        // Every 5 seconds, 20% chance to pick a random target instead of closest
        if (Math.random() < 0.2 && this.game && this.game.player) {
            // Get all players
            const players = [this.game.player];
            
            // Add other players if they exist
            if (this.game.otherPlayers) {
                players.push(...Object.values(this.game.otherPlayers));
            }
            
            // Filter to only include alive players
            const alivePlayers = players.filter(p => p.stats.health > 0);
            
            if (alivePlayers.length > 0) {
                // Pick a random player
                const randomPlayer = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                this.targetPosition.copy(randomPlayer.yawObject.position);
                return;
            }
        }
        
        // Default to closest player
        const closestPlayer = this.findClosestPlayer();
        
        if (closestPlayer) {
            this.targetPosition.copy(closestPlayer.yawObject.position);
        }
    }
    
    findClosestPlayer() {
        if (!this.game || !this.game.player) return null;
        
        // Check local player first
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
        // Simple pathfinding - update target periodically
        this.lastPathfindTime += delta;
        
        if (this.lastPathfindTime >= this.pathfindInterval) {
            this.lastPathfindTime = 0;
            
            // Ensure boss stays within room bounds
            this.adjustTargetForObstacles();
        }
    }
    
    adjustTargetForObstacles() {
        // Keep boss within room bounds
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
            
            // Apply movement, with some random variation
            if (Math.random() < 0.7) {
                // Move directly toward target
                this.mesh.position.add(direction);
            } else {
                // Add some randomness to movement
                const randomAngle = (Math.random() - 0.5) * Math.PI / 4;
                direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), randomAngle);
                this.mesh.position.add(direction);
            }
            
            // Face towards movement direction
            if (direction.length() > 0.01) {
                this.mesh.lookAt(this.targetPosition);
                
                // Keep boss upright
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
            if (this.game && this.game.isMultiplayer) {
                // Send attack event to server
                if (window.socket) {
                    window.socket.emit('bossAttacked', {
                        bossId: this.id,
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
        
        // Visual effect for attack
        this.showAttackEffect(player.yawObject.position);
    }
    
    performSpecialAttack() {
        // Special attack hits all players in range
        this.animationState = 'specialAttack';
        
        // Get all players
        const players = [this.game.player];
        
        // Add other players if they exist
        if (this.game.otherPlayers) {
            players.push(...Object.values(this.game.otherPlayers));
        }
        
        // Filter to only include players in range
        const playersInRange = players.filter(player => {
            const distance = this.mesh.position.distanceTo(player.yawObject.position);
            return distance <= this.specialAttackRange;
        });
        
        // Attack all players in range
        let hitAnyPlayer = false;
        
        for (const player of playersInRange) {
            if (player && player.takeDamage) {
                hitAnyPlayer = true;
                
                // In multiplayer, handled by server
                if (this.game && this.game.isMultiplayer) {
                    if (window.socket) {
                        window.socket.emit('bossSpecialAttack', {
                            bossId: this.id,
                            playerId: player.id,
                            damage: this.specialAttackDamage
                        });
                    }
                } else {
                    // Direct damage in single player
                    player.takeDamage(this.specialAttackDamage);
                    
                    // Update UI
                    if (this.game.updatePlayerHealth) {
                        this.game.updatePlayerHealth(player.stats.health);
                    }
                }
            }
        }
        
        // Visual effect for special attack
        if (hitAnyPlayer) {
            this.showSpecialAttackEffect();
        }
    }
    
    showAttackEffect(targetPosition) {
        // Create a simple visual effect for the attack
        const attackGeometry = new THREE.ConeGeometry(0.3, 2, 8);
        const attackMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.6 
        });
        const attackMesh = new THREE.Mesh(attackGeometry, attackMaterial);
        
        // Position and orient the attack visual
        attackMesh.position.copy(this.mesh.position);
        attackMesh.lookAt(targetPosition);
        
        // Rotate to point forward
        attackMesh.rotateX(Math.PI / 2);
        
        // Add to scene
        this.game.scene.add(attackMesh);
        
        // Fade out and remove
        const startTime = performance.now();
        const duration = 300; // ms
        
        function animate() {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1.0, elapsed / duration);
            
            if (progress < 1.0) {
                // Scale and fade
                attackMesh.scale.set(1.0 + progress, 1.0 - progress, 1.0 + progress);
                attackMaterial.opacity = 0.6 * (1.0 - progress);
                
                requestAnimationFrame(animate);
            } else {
                // Remove when done
                if (attackMesh.parent) {
                    attackMesh.parent.remove(attackMesh);
                }
            }
        }
        
        animate();
    }
    
    showSpecialAttackEffect() {
        // Create a shockwave effect
        const shockwaveGeometry = new THREE.RingGeometry(0.5, 1, 32);
        const shockwaveMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
        
        // Position at boss feet
        shockwave.position.copy(this.mesh.position);
        shockwave.position.y = 0.1;
        shockwave.rotation.x = -Math.PI / 2; // Lay flat on ground
        
        // Add to scene
        this.game.scene.add(shockwave);
        
        // Expand and fade out
        const startTime = performance.now();
        const duration = 1000; // ms
        const maxRadius = this.specialAttackRange;
        
        function animate() {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1.0, elapsed / duration);
            
            if (progress < 1.0) {
                // Expand
                const scale = 1 + progress * maxRadius;
                shockwave.scale.set(scale, scale, 1);
                shockwaveMaterial.opacity = 0.8 * (1.0 - progress);
                
                requestAnimationFrame(animate);
            } else {
                // Remove when done
                if (shockwave.parent) {
                    shockwave.parent.remove(shockwave);
                }
            }
        }
        
        animate();
    }
    
    takeDamage(amount) {
        // Reduce health
        this.health = Math.max(0, this.health - amount);
        
        // Check if boss died
        if (this.health <= 0) {
            this.die();
        }
        
        // Show damage indicator
        this.showDamageIndicator();
        
        // Return current health
        return this.health;
    }
    
    showDamageIndicator() {
        // Flash the boss to show damage
        if (!this.mesh) return;
        
        const material = this.mesh.material;
        const originalColor = material.color.clone();
        
        // Flash white
        material.color.set(0xffffff);
        
        // Return to original color after a short delay
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
    }
    
    playDeathAnimation() {
        // Boss death animation - more dramatic than regular enemies
        if (!this.mesh) return;
        
        // Make the boss fall and disintegrate
        const disintegrateDuration = 3.0;
        const startTime = performance.now() / 1000;
        
        // Create explosion particles
        this.createDeathExplosion();
        
        const animate = () => {
            if (!this.mesh) return;
            
            const now = performance.now() / 1000;
            const elapsed = now - startTime;
            const progress = Math.min(1.0, elapsed / disintegrateDuration);
            
            // Rotate and sink
            this.mesh.rotation.y += 0.1;
            this.mesh.position.y = Math.max(0.1, 1.5 - progress * 1.5);
            
            // Scale down
            const scale = 1.0 - progress * 0.5;
            this.mesh.scale.set(scale, scale, scale);
            
            // Fade out
            if (this.mesh.material) {
                this.mesh.material.opacity = 1.0 - progress;
                this.mesh.material.transparent = true;
            }
            
            // Continue animation if not done
            if (progress < 1.0) {
                requestAnimationFrame(animate);
            } else {
                setTimeout(() => this.remove(), 500);
            }
        };
        
        // Start animation
        animate();
    }
    
    createDeathExplosion() {
        // Create particle explosion effect on death
        const particleCount = 50;
        const particleGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff5500, 
            transparent: true, 
            opacity: 0.8 
        });
        
        const particles = [];
        
        // Create particles
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
            particle.position.copy(this.mesh.position);
            
            // Random velocity
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 5,
                Math.random() * 5,
                (Math.random() - 0.5) * 5
            );
            
            this.game.scene.add(particle);
            particles.push(particle);
        }
        
        // Animate particles
        const startTime = performance.now() / 1000;
        const duration = 2.0;
        
        const animateParticles = () => {
            const now = performance.now() / 1000;
            const elapsed = now - startTime;
            const progress = Math.min(1.0, elapsed / duration);
            
            // Update each particle
            for (const particle of particles) {
                // Apply gravity
                particle.velocity.y -= 0.1;
                
                // Move particle
                particle.position.add(particle.velocity.clone().multiplyScalar(0.016));
                
                // Fade out
                if (particle.material) {
                    particle.material.opacity = 0.8 * (1.0 - progress);
                }
            }
            
            // Continue animation if not done
            if (progress < 1.0) {
                requestAnimationFrame(animateParticles);
            } else {
                // Remove particles
                for (const particle of particles) {
                    if (particle.parent) {
                        particle.parent.remove(particle);
                    }
                }
            }
        };
        
        // Start animation
        animateParticles();
    }
    
    remove() {
        // Remove from scene if mesh still exists
        if (this.mesh && this.mesh.parent) {
            this.mesh.parent.remove(this.mesh);
        }
        
        // Notify game of boss defeat
        if (this.game && this.game.onBossDefeated) {
            this.game.onBossDefeated(this);
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
        // Simple collision response - push away from obstacles
        if (other.type === 'box') {
            // Calculate closest point on the box to the boss
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