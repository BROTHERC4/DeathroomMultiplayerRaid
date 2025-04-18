const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Configure proper MIME types
express.static.mime.define({
  'text/css': ['css'],
  'text/javascript': ['js'],
  'application/javascript': ['mjs']
});

// Serve static files from the client directory with proper path resolution
app.use(express.static(path.join(__dirname, '../client')));

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Additional fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Party management
const parties = {};
let roomCounter = 0;

// Room generation config
const roomTypes = [
  { name: 'Dungeon Cell', difficulty: 1 },
  { name: 'Torture Chamber', difficulty: 2 },
  { name: 'Crypt', difficulty: 3 },
  { name: 'Summoning Room', difficulty: 4 },
  { name: 'Throne Room', difficulty: 5 }
];

const bossTypes = [
  { name: 'Reanimated Executioner', health: 200, damage: 20 },
  { name: 'Blood Acolyte', health: 300, damage: 25 },
  { name: 'Pit Fiend', health: 400, damage: 30 },
  { name: 'Necrotic Hierophant', health: 500, damage: 35 },
  { name: 'Deathlord', health: 750, damage: 40 }
];

function generateRoom(difficulty) {
  // Define room type based on difficulty
  const roomType = roomTypes[Math.min(Math.floor(difficulty / 3), roomTypes.length - 1)];
  
  // Every room has a boss, with increasing difficulty
  let boss = null;
  
  // Select boss type based on difficulty
  const bossIndex = Math.min(Math.floor(difficulty / 5), bossTypes.length - 1);
  boss = { 
    ...bossTypes[bossIndex],
    id: `boss-${difficulty}`,
    type: bossIndex,
    position: { x: 0, y: 1, z: 0 }
  };
  
  return {
    id: `room-${difficulty}`,
    type: roomType.name,
    difficulty,
    isBossRoom: true,
    enemies: [], // No regular enemies
    boss,
    loot: []
  };
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Host a new party
  socket.on('hostParty', () => {
    const partyCode = generatePartyCode();
    
    parties[partyCode] = { 
      host: socket.id, 
      players: [socket.id], 
      state: {
        currentRoom: 0,
        rooms: [generateRoom(0)], // First room is level 0 (tutorial)
        playerStates: {}
      }
    };
    
    // Initialize host player state
    parties[partyCode].state.playerStates[socket.id] = {
      health: 100,
      maxHealth: 100,
      level: 1,
      kills: 0
    };
    
    socket.join(partyCode);
    socket.emit('partyHosted', partyCode);
    console.log(`Party hosted: ${partyCode} by ${socket.id}`);
  });

  // Join an existing party
  socket.on('joinParty', (partyCode) => {
    // Validate party
    if (!parties[partyCode]) {
      socket.emit('joinError', 'Party not found');
      return;
    }
    
    // Check if party is full
    if (parties[partyCode].players.length >= 4) {
      socket.emit('joinError', 'Party is full');
      return;
    }
    
    // Add player to party
    parties[partyCode].players.push(socket.id);
    
    // Initialize player state
    parties[partyCode].state.playerStates[socket.id] = {
      health: 100,
      maxHealth: 100,
      level: 1,
      kills: 0
    };
    
    socket.join(partyCode);
    
    // Notify about successful join
    socket.emit('joinSuccess', partyCode, parties[partyCode].players);
    
    // Notify others in party
    socket.to(partyCode).emit('playerJoined', socket.id);
    
    console.log(`Player ${socket.id} joined party: ${partyCode}`);
  });

  // Start the game
  socket.on('startGame', (partyCode) => {
    if (parties[partyCode] && parties[partyCode].host === socket.id) {
      io.to(partyCode).emit('gameStarted', parties[partyCode].state);
      console.log(`Game started in party: ${partyCode}`);
    }
  });

  // Player input updates
  socket.on('playerInput', (partyCode, input) => {
    if (parties[partyCode] && parties[partyCode].players.includes(socket.id)) {
      // Broadcast to all other players in the party
      socket.to(partyCode).emit('inputUpdate', socket.id, input);
    }
  });

  // Player attacks
  socket.on('playerAttack', (partyCode, attackData) => {
    if (parties[partyCode] && parties[partyCode].players.includes(socket.id)) {
      // Broadcast attack to all other players
      socket.to(partyCode).emit('playerAttacked', socket.id, attackData);
      
      // Process hit if this was against an enemy
      if (attackData.targetType === 'enemy' && attackData.hit) {
        const partyState = parties[partyCode].state;
        const currentRoom = partyState.rooms[partyState.currentRoom];
        
        // Handle boss hit
        if (attackData.targetId.startsWith('boss') && currentRoom.boss) {
          currentRoom.boss.health -= attackData.damage;
          
          // Check if boss defeated
          if (currentRoom.boss.health <= 0) {
            // Generate next room
            partyState.rooms.push(generateRoom(partyState.currentRoom + 1));
            partyState.currentRoom++;
            
            // Broadcast room completed
            io.to(partyCode).emit('roomCompleted', {
              defeatedBoss: currentRoom.boss,
              newRoom: partyState.rooms[partyState.currentRoom]
            });
          } else {
            // Broadcast boss health update
            io.to(partyCode).emit('bossHealthUpdate', currentRoom.boss);
          }
        } 
        // Handle regular enemy hit
        else if (attackData.targetId.startsWith('enemy')) {
          // Find the enemy
          const enemyIndex = currentRoom.enemies.findIndex(e => e.id === attackData.targetId);
          if (enemyIndex !== -1) {
            const enemy = currentRoom.enemies[enemyIndex];
            enemy.health -= attackData.damage;
            
            // Check if enemy defeated
            if (enemy.health <= 0) {
              // Remove from enemies array
              currentRoom.enemies.splice(enemyIndex, 1);
              
              // Update player kills
              partyState.playerStates[socket.id].kills++;
              
              // Broadcast enemy defeated
              io.to(partyCode).emit('enemyDefeated', {
                enemyId: enemy.id,
                killedBy: socket.id
              });
              
              // Check if room cleared
              if (currentRoom.enemies.length === 0 && !currentRoom.boss) {
                // Generate next room
                partyState.rooms.push(generateRoom(partyState.currentRoom + 1));
                partyState.currentRoom++;
                
                // Broadcast room completed
                io.to(partyCode).emit('roomCompleted', {
                  roomCleared: true,
                  newRoom: partyState.rooms[partyState.currentRoom]
                });
              }
            } else {
              // Broadcast enemy health update
              io.to(partyCode).emit('enemyHealthUpdate', {
                enemyId: enemy.id,
                health: enemy.health
              });
            }
          }
        }
      }
    }
  });

  // Player takes damage
  socket.on('playerDamaged', (partyCode, damageData) => {
    if (parties[partyCode] && parties[partyCode].players.includes(socket.id)) {
      const playerState = parties[partyCode].state.playerStates[socket.id];
      
      // Apply damage
      playerState.health = Math.max(0, playerState.health - damageData.amount);
      
      // Broadcast updated player health
      io.to(partyCode).emit('playerHealthUpdate', socket.id, playerState.health);
      
      // Check if player died
      if (playerState.health <= 0) {
        io.to(partyCode).emit('playerDied', socket.id);
        
        // Check if all players are dead (game over)
        const allPlayersDead = Object.values(parties[partyCode].state.playerStates)
          .every(player => player.health <= 0);
        
        if (allPlayersDead) {
          io.to(partyCode).emit('gameOver', {
            roomsCleared: parties[partyCode].state.currentRoom,
            playerStats: parties[partyCode].state.playerStates
          });
        }
      }
    }
  });

  // Player collected loot
  socket.on('collectLoot', (partyCode, lootId) => {
    if (parties[partyCode] && parties[partyCode].players.includes(socket.id)) {
      const currentRoom = parties[partyCode].state.rooms[parties[partyCode].state.currentRoom];
      
      // Find and remove the loot
      const lootIndex = currentRoom.loot.findIndex(l => l.id === lootId);
      if (lootIndex !== -1) {
        const loot = currentRoom.loot.splice(lootIndex, 1)[0];
        
        // Apply loot effects to player
        const playerState = parties[partyCode].state.playerStates[socket.id];
        
        if (loot.type === 'health') {
          playerState.health = Math.min(playerState.maxHealth, playerState.health + loot.value);
          io.to(partyCode).emit('playerHealthUpdate', socket.id, playerState.health);
        } else if (loot.type === 'maxHealth') {
          playerState.maxHealth += loot.value;
          playerState.health += loot.value;
          io.to(partyCode).emit('playerStatsUpdate', socket.id, playerState);
        }
        
        // Broadcast loot collected
        io.to(partyCode).emit('lootCollected', {
          lootId,
          playerId: socket.id
        });
      }
    }
  });

  // Handle disconnects
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Find any parties this player belongs to
    for (const partyCode in parties) {
      const party = parties[partyCode];
      const playerIndex = party.players.indexOf(socket.id);
      
      if (playerIndex !== -1) {
        // Remove player from party
        party.players.splice(playerIndex, 1);
        
        // Notify remaining players
        io.to(partyCode).emit('playerLeft', socket.id);
        
        // If this was the host, reassign host or delete party if empty
        if (party.host === socket.id) {
          if (party.players.length > 0) {
            party.host = party.players[0];
            io.to(partyCode).emit('newHost', party.host);
          } else {
            delete parties[partyCode];
            console.log(`Party ${partyCode} deleted (empty)`);
          }
        }
        
        // If party is now empty, delete it
        if (party.players.length === 0) {
          delete parties[partyCode];
          console.log(`Party ${partyCode} deleted (empty)`);
        }
        
        // Remove player state
        if (party.state && party.state.playerStates) {
          delete party.state.playerStates[socket.id];
        }
        
        break;
      }
    }
  });
});

// Generate a random party code
function generatePartyCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit similar looking characters
  let code = '';
  
  // Generate a 6-character code
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters.charAt(randomIndex);
  }
  
  // Check if code already exists, regenerate if it does
  if (parties[code]) {
    return generatePartyCode();
  }
  
  return code;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Something went wrong on the server');
});

// Start the server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));