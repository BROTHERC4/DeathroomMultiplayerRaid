// Mobile support module for the game
// This handles mobile device detection, optimizations, and touch controls

// Import THREE.js
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

// Export functions to be used in main.js
export { 
    detectMobile,
    createMobileOptimizedRenderer,
    setupMobileControls,
    updateRendererForMobile,
    setupAssetLoader,
    initializeMobileSupport
};

// 1. Better mobile detection with feature detection
function detectMobile() {
  const userAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const touchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const smallScreen = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  
  return userAgent || (touchSupport && smallScreen);
}

// 2. Mobile-specific WebGL renderer settings
function createMobileOptimizedRenderer() {
  // Try-catch to handle WebGL initialization errors
  try {
    // Create renderer with mobile-friendly settings
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disable antialiasing on mobile
      powerPreference: 'high-performance',
      alpha: false,
      precision: 'mediump', // Use medium precision for better performance
      failIfMajorPerformanceCaveat: false // Don't fail on low-end devices
    });
    
    // Set pixel ratio much lower for mobile
    const pixelRatio = Math.min(window.devicePixelRatio, 0.5);
    renderer.setPixelRatio(pixelRatio);
    
    // Set size
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Disable shadows on mobile entirely
    renderer.shadowMap.enabled = false;
    
    console.log("Mobile-optimized renderer created successfully");
    return renderer;
  } catch (e) {
    console.error("Failed to create WebGL renderer:", e);
    
    // Show helpful error message to user
    document.body.innerHTML = `
      <div style="text-align: center; padding: 20px; color: white; background: #333;">
        <h2>WebGL Not Available</h2>
        <p>Your device doesn't support WebGL, which is required to play this game.</p>
        <p>Please try a different browser or device.</p>
        <p>Error details: ${e.message}</p>
      </div>
    `;
    throw e;
  }
}

// 3. Enhanced mobile controls setup
function setupMobileControls() {
  if (!window.isMobile) return;
  
  console.log("Setting up mobile controls");
  
  // Show mobile controls
  const mobileControls = document.getElementById('mobileControls');
  if (mobileControls) {
    mobileControls.style.display = 'block';
  }
  
  // Setup joystick with improved touch handling
  setupJoystick();
  
  // Setup attack button with better touch response
  setupAttackButton();
  
  // Setup look controls with improved sensitivity
  setupLookControls();

  // Setup orientation handling
  setupOrientationHandling();
}

// 4. Improved joystick implementation
function setupJoystick() {
  const joystickContainer = document.getElementById('joystickContainer');
  const joystick = document.getElementById('joystick');
  
  if (!joystickContainer || !joystick) {
    console.error("Joystick elements not found");
    return;
  }
  
  let joystickActive = false;
  let joystickTouchId = null;
  
  // Handle touch start with improved touch detection
  joystickContainer.addEventListener('touchstart', (event) => {
    event.preventDefault();
    
    if (!joystickActive && event.changedTouches.length > 0) {
      joystickActive = true;
      joystickTouchId = event.changedTouches[0].identifier;
      
      // Get container position
      const rect = joystickContainer.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Update joystick position
      updateJoystickPosition(event.changedTouches[0].clientX, event.changedTouches[0].clientY, centerX, centerY);
    }
  }, { passive: false });
  
  // Handle touch move with proper touch identification
  joystickContainer.addEventListener('touchmove', (event) => {
    if (!joystickActive) return;
    event.preventDefault();
    
    // Find the right touch based on identifier
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        // Get container position
        const rect = joystickContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        // Update joystick position
        updateJoystickPosition(touch.clientX, touch.clientY, centerX, centerY);
        break;
      }
    }
  }, { passive: false });
  
  // Handle touch end with proper cleanup
  joystickContainer.addEventListener('touchend', (event) => {
    event.preventDefault();
    
    // Find the right touch based on identifier
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (touch.identifier === joystickTouchId) {
        // Reset joystick
        joystickActive = false;
        joystick.style.transform = 'translate(-50%, -50%)';
        
        // Reset movement state
        if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
          window.gameObjects.player.controller.moveState.forward = false;
          window.gameObjects.player.controller.moveState.backward = false;
          window.gameObjects.player.controller.moveState.left = false;
          window.gameObjects.player.controller.moveState.right = false;
        }
        break;
      }
    }
  }, { passive: false });
  
  // Also handle touchcancel event for better reliability
  joystickContainer.addEventListener('touchcancel', (event) => {
    // Same logic as touchend
    joystickActive = false;
    joystick.style.transform = 'translate(-50%, -50%)';
    
    if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
      window.gameObjects.player.controller.moveState.forward = false;
      window.gameObjects.player.controller.moveState.backward = false;
      window.gameObjects.player.controller.moveState.left = false;
      window.gameObjects.player.controller.moveState.right = false;
    }
  }, { passive: false });
}

// Helper function for joystick position updates
function updateJoystickPosition(touchX, touchY, centerX, centerY) {
  const joystick = document.getElementById('joystick');
  if (!joystick) return;
  
  // Calculate delta from center
  let deltaX = touchX - centerX;
  let deltaY = touchY - centerY;
  
  // Calculate distance from center
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  
  // Get joystick container for size reference
  const joystickContainer = document.getElementById('joystickContainer');
  if (!joystickContainer) return;
  
  // Limit joystick movement to container bounds
  const maxDistance = joystickContainer.clientWidth / 2;
  if (distance > maxDistance) {
    deltaX = deltaX * maxDistance / distance;
    deltaY = deltaY * maxDistance / distance;
  }
  
  // Update joystick visual position
  joystick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
  
  // Update movement flags for player controller
  if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
    // Use a small dead zone (15% of max distance) for better control
    const deadZone = maxDistance * 0.15;
    const normalizedX = Math.abs(deltaX) < deadZone ? 0 : deltaX / maxDistance;
    const normalizedY = Math.abs(deltaY) < deadZone ? 0 : deltaY / maxDistance;
    
    // Set movement state
    window.gameObjects.player.controller.moveState.forward = normalizedY < -0.3;
    window.gameObjects.player.controller.moveState.backward = normalizedY > 0.3;
    window.gameObjects.player.controller.moveState.left = normalizedX < -0.3;
    window.gameObjects.player.controller.moveState.right = normalizedX > 0.3;
    
    // Store normalized values for analog movement
    if (!window.gameObjects.player.controller.moveAnalog) {
      window.gameObjects.player.controller.moveAnalog = { x: 0, y: 0 };
    }
    window.gameObjects.player.controller.moveAnalog.x = normalizedX;
    window.gameObjects.player.controller.moveAnalog.y = normalizedY;
  }
}

// 5. Improved attack button
function setupAttackButton() {
  const attackButton = document.getElementById('attackButton');
  if (!attackButton) {
    console.error("Attack button element not found");
    return;
  }
  
  // Use touchstart instead of click for more responsive feel
  attackButton.addEventListener('touchstart', (event) => {
    event.preventDefault();
    
    // Visual feedback
    attackButton.style.transform = 'scale(0.9)';
    attackButton.style.backgroundColor = 'rgba(255, 20, 20, 0.8)';
    
    // Perform attack
    if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
      window.gameObjects.player.controller.attack();
    }
  }, { passive: false });
  
  // Reset visual on touch end
  attackButton.addEventListener('touchend', (event) => {
    event.preventDefault();
    attackButton.style.transform = 'scale(1.0)';
    attackButton.style.backgroundColor = 'rgba(255, 50, 50, 0.6)';
  }, { passive: false });
  
  // Also handle touchcancel
  attackButton.addEventListener('touchcancel', (event) => {
    attackButton.style.transform = 'scale(1.0)';
    attackButton.style.backgroundColor = 'rgba(255, 50, 50, 0.6)';
  }, { passive: false });
}

// 6. Improved look controls
function setupLookControls() {
  const lookControls = document.getElementById('lookControls');
  if (!lookControls) {
    console.error("Look controls element not found");
    return;
  }
  
  let lookTouchId = null;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchStartTime = 0;
  
  lookControls.addEventListener('touchstart', (event) => {
    // Skip if we already have an active touch
    if (lookTouchId !== null) return;
    
    const touch = event.changedTouches[0];
    
    // Skip if touch is in joystick or attack button area
    const joystickRect = document.getElementById('joystickContainer')?.getBoundingClientRect();
    const attackRect = document.getElementById('attackButton')?.getBoundingClientRect();
    
    if (joystickRect && attackRect) {
      if ((touch.clientX >= joystickRect.left && touch.clientX <= joystickRect.right && 
           touch.clientY >= joystickRect.top && touch.clientY <= joystickRect.bottom) ||
          (touch.clientX >= attackRect.left && touch.clientX <= attackRect.right && 
           touch.clientY >= attackRect.top && touch.clientY <= attackRect.bottom)) {
        return;
      }
    }
    
    event.preventDefault();
    
    // Store touch info
    lookTouchId = touch.identifier;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    touchStartTime = Date.now();
  }, { passive: false });
  
  lookControls.addEventListener('touchmove', (event) => {
    if (lookTouchId === null) return;
    
    event.preventDefault();
    
    // Find our tracked touch
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        // Calculate movement
        const movementX = touch.clientX - lastTouchX;
        const movementY = touch.clientY - lastTouchY;
        
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        
        // Apply to camera rotation
        if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
          // Use dynamic sensitivity based on screen size
          const screenSizeFactor = Math.min(1, window.innerWidth / 1024);
          const baseSensitivity = 0.005;
          const sensitivity = baseSensitivity * screenSizeFactor;
          
          // Apply rotation
          window.gameObjects.player.controller.yawObject.rotation.y -= movementX * sensitivity;
          
          window.gameObjects.player.controller.pitchObject.rotation.x -= movementY * sensitivity;
          window.gameObjects.player.controller.pitchObject.rotation.x = Math.max(
            -Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, window.gameObjects.player.controller.pitchObject.rotation.x)
          );
        }
        
        break;
      }
    }
  }, { passive: false });
  
  const endTouch = (event) => {
    if (lookTouchId === null) return;
    
    // Check if this is our tracked touch
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        // Check if this was a quick tap (less than 300ms)
        const touchDuration = Date.now() - touchStartTime;
        if (touchDuration < 300) {
          // This was a tap - perform attack
          if (window.gameObjects && window.gameObjects.player && window.gameObjects.player.controller) {
            window.gameObjects.player.controller.attack();
          }
        }
        
        // Reset touch tracking
        lookTouchId = null;
        break;
      }
    }
  };
  
  // Handle both touchend and touchcancel
  lookControls.addEventListener('touchend', endTouch, { passive: false });
  lookControls.addEventListener('touchcancel', endTouch, { passive: false });
}

// 9. Better orientation handling
function setupOrientationHandling() {
  const rotateDevice = document.getElementById('rotateDevice');
  if (!rotateDevice) {
    console.error("Rotate device element not found");
    return;
  }
  
  function checkOrientation() {
    if (!window.isMobile) return;
    
    const isPortrait = window.innerHeight > window.innerWidth;
    
    if (isPortrait) {
      // Show rotation message in portrait mode
      rotateDevice.style.display = 'flex';
      
      // Pause game if it's running
      if (window.isRunning) {
        window.isRunning = false;
        if (updateMobileDebugInfo) {
          updateMobileDebugInfo('Game paused (portrait)');
        }
      }
    } else {
      // Hide message in landscape mode
      rotateDevice.style.display = 'none';
      
      // Resume game if we're in game screen
      if (!window.isRunning && window.gameState && window.gameState.currentScreen === "game") {
        window.isRunning = true;
        if (updateMobileDebugInfo) {
          updateMobileDebugInfo('Game resumed (landscape)');
        }
      }
    }
  }
  
  // Check on resize and orientation change
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  
  // Initial check
  checkOrientation();
  
  // Make function globally available
  window.checkOrientation = checkOrientation;
}

// 10. Mobile-specific renderer adjustments
function updateRendererForMobile(renderer) {
  if (!window.isMobile || !renderer) return;
  
  // Performance optimizations
  renderer.shadowMap.enabled = false;
  renderer.outputEncoding = THREE.LinearEncoding; // Faster than sRGB
  
  // Less precise but faster color output
  renderer.gammaFactor = 2.2;
  renderer.toneMappingExposure = 1;
  
  // Set lower resolution
  const resolutionScale = 0.5; // 50% resolution
  renderer.setSize(
    Math.floor(window.innerWidth * resolutionScale),
    Math.floor(window.innerHeight * resolutionScale),
    false // Don't update style, keep full CSS size
  );
  
  console.log("Mobile renderer optimizations applied");
}

// 11. Better asset loading and progress tracking
function setupAssetLoader() {
  // Create a central loading manager
  const loadingManager = new THREE.LoadingManager();
  
  // Track loading progress
  loadingManager.onProgress = function(url, itemsLoaded, itemsTotal) {
    const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
    console.log(`Loading: ${percent}% (${itemsLoaded}/${itemsTotal})`);
    
    // Update loading bar if it exists
    if (window.updateLoadingProgress) {
      window.updateLoadingProgress(percent);
    }
  };
  
  // Handle loading complete
  loadingManager.onLoad = function() {
    console.log('All assets loaded');
    
    // Hide loading screen with small delay
    setTimeout(function() {
      const loadingScreen = document.getElementById('gameLoading');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.remove(), 500);
      }
    }, 500);
  };
  
  // Handle loading errors
  loadingManager.onError = function(url) {
    console.error('Error loading asset:', url);
    
    // Update loading screen with error
    const loadingScreen = document.getElementById('gameLoading');
    if (loadingScreen) {
      const loadingMessage = loadingScreen.querySelector('h2');
      if (loadingMessage) {
        loadingMessage.textContent = 'Error loading game assets';
        loadingMessage.style.color = '#ff4444';
      }
    }
  };
  
  // Make available globally
  window.assetLoaders = {
    loadingManager,
    gltfLoader: new GLTFLoader(loadingManager),
    textureLoader: new THREE.TextureLoader(loadingManager),
    fontLoader: new FontLoader(loadingManager)
  };
  
  return window.assetLoaders;
}

// Main mobile initialization function
function initializeMobileSupport() {
  console.log("Initializing mobile support...");
  
  // Detect mobile first
  window.isMobile = detectMobile();
  
  // Set up asset loader
  setupAssetLoader();
  
  // Setup orientation handling
  setupOrientationHandling();
  
  // Setup mobile controls when needed
  if (window.isMobile) {
    setupMobileControls();
  }
  
  console.log("Mobile support initialized");
  
  return window.isMobile;
}
