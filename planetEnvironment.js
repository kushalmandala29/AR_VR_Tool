import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.145.0/build/three.module.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.145.0/examples/jsm/controls/OrbitControls.js';

export class PlanetEnvironment {
    constructor(scene, camera, renderer) {
        console.log('Initializing PlanetEnvironment...');
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.clock = new THREE.Clock();
        this.mixers = [];
        this.textureLoader = new THREE.TextureLoader();
        this.isInUpdateLoop = false;
        this.throwStartTime = 0;
        this.throwStartPosition = new THREE.Vector3();
        this.flightData = {
            initialVelocity: 0,
            angle: 0,
            range: 0,
            maxHeight: 0,
            flightTime: 0,
            theoreticalRange: 0,
            theoreticalTime: 0
        };

        // Initialize movement controls
        this.keyStates = {
            'w': false,
            's': false,
            'a': false,
            'd': false,
            ' ': false,  // space for jump
            'e': false   // e for picking up/holding ball
        };
        
        // Trajectory visualization properties
        this.trajectoryLine = null;
        this.trajectoryPoints = [];
        this.isAiming = false;
        this.throwForce = 15;
        this.throwAngle = Math.PI / 4; // 45 degrees
        this.gravity = 9.82; // m/s²
        this.landingMarker = null;
        this.throwStartPosition = new THREE.Vector3();
        this.throwStartTime = 0;
        this.isThrown = false;
        this.isHoldingBall = true; // Flag to track if character is holding the ball
        this.ballThrown = false;   // Flag for projectile motion simulation
        this.flightData = {
            range: 0,
            maxHeight: 0,
            flightTime: 0,
            initialVelocity: 0,
            angle: 0
        };
        
        // UI controls references
        this.controls = {
            physicsPanel: null
        };

        // Create UI for adjusting throw parameters
        this.createControls();
        
        // Bind event handlers
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.update = this.update.bind(this);
        this.updateTrajectory = this.updateTrajectory.bind(this);
        this.throwBall = this.throwBall.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);

        // Add event listeners
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);

        // Start update loop
        this.lastTime = performance.now();
        this.update();
        
        // Initialize projectile motion properties
        this.projectileKeyStates = {
            'w': false,         // Increase force
            's': false,         // Decrease force
            'arrowup': false,   // Increase angle
            'arrowdown': false, // Decrease angle
            ' ': false,         // Throw ball (spacebar)
            'i': false,         // Move forward
            'k': false,         // Move backward
            'j': false,         // Move left
            'l': false          // Move right
        };
        
        // Add event listeners for projectile motion controls
        window.addEventListener('keydown', this.onProjectileKeyDown.bind(this));
        window.addEventListener('keyup', this.onProjectileKeyUp.bind(this));
        
        // Initialize projectile physics
        this.initProjectilePhysics();
    }

    initProjectilePhysics() {
        // Create physics world if it doesn't exist
        if (!this.physicsWorld) {
            this.physicsWorld = new CANNON.World();
            this.physicsWorld.gravity.set(0, -9.82, 0); // Earth gravity
        }
        
        // Create ground plane for ball to land on
        const groundShape = new CANNON.Plane();
        const groundBody = new CANNON.Body({ mass: 0 }); // Mass 0 makes it static
        groundBody.addShape(groundShape);
        groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2); // Rotate to be flat
        this.physicsWorld.addBody(groundBody);
        
        // Create ball for projectile
        const ballRadius = 0.5;
        const ballShape = new CANNON.Sphere(ballRadius);
        this.ballBody = new CANNON.Body({
            mass: 1,
            position: new CANNON.Vec3(0, 2, 0)
        });
        this.ballBody.addShape(ballShape);
        this.physicsWorld.addBody(this.ballBody);
        
        // Create visual representation of the ball
        const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
        const ballMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        this.ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);
        this.scene.add(this.ballMesh);
        
        // Create trajectory line
        const trajectoryGeometry = new THREE.BufferGeometry();
        const trajectoryMaterial = new THREE.LineDashedMaterial({
            color: 0xffffff,
            dashSize: 0.2,
            gapSize: 0.1
        });
        this.trajectoryLine = new THREE.Line(trajectoryGeometry, trajectoryMaterial);
        this.scene.add(this.trajectoryLine);
        
        // Create landing marker
        const markerGeometry = new THREE.RingGeometry(0.5, 0.7, 32);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7
        });
        this.landingMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        this.landingMarker.rotation.x = -Math.PI / 2; // Make it flat on the ground
        this.landingMarker.visible = false;
        this.scene.add(this.landingMarker);
    }

    update() {
        const time = performance.now();
        const delta = (time - this.lastTime) / 1000;
        this.lastTime = time;

        if (this.isInUpdateLoop) {
            // Update physics
            if (this.physicsWorld && this.ballBody && this.ballMesh) {
                this.updateProjectilePhysics(delta);
            }

            // Update camera controls
            if (this.controls) {
                this.controls.update();
            }

            // Handle character movement with new controls (I, K, J, L)
            this.handleCharacterMovement(delta);

            // Check if ball has landed and needs to be reset
            if (this.ballThrown && this.ballBody && this.ballBody.position.y <= 0.5 && Math.abs(this.ballBody.velocity.y) < 0.1) {
                // Ball has landed and stopped
                setTimeout(() => this.resetBall(), 2000); // Reset after 2 seconds
            }

            // Update trajectory preview if holding ball
            if (this.isHoldingBall && !this.ballThrown) {
                this.updateTrajectoryPreview();
                this.updatePhysicsCalculations();
            }
        }

        // Continue animation loop
        requestAnimationFrame(this.update.bind(this));
    }

    updateProjectilePhysics(deltaTime) {
        // Step physics world
        this.physicsWorld.step(1/60, deltaTime, 3);
        
        // Update ball mesh position to match physics body
        this.ballMesh.position.copy(this.ballBody.position);
        this.ballMesh.quaternion.copy(this.ballBody.quaternion);
    }

    handleCharacterMovement(deltaTime) {
        if (!this.character || !this.characterBody) return;
        
        const moveSpeed = 5 * deltaTime;
        const moveDirection = new THREE.Vector3();
        
        // Forward/backward movement (I/K keys)
        if (this.projectileKeyStates['i']) {
            moveDirection.z -= 1;
        }
        if (this.projectileKeyStates['k']) {
            moveDirection.z += 1;
        }
        
        // Left/right movement (J/L keys)
        if (this.projectileKeyStates['j']) {
            moveDirection.x -= 1;
        }
        if (this.projectileKeyStates['l']) {
            moveDirection.x += 1;
        }
        
        // Normalize movement vector
        if (moveDirection.length() > 0) {
            moveDirection.normalize();
            
            // Apply camera rotation to movement direction
            moveDirection.applyQuaternion(this.camera.quaternion);
            moveDirection.y = 0; // Keep movement on xz plane
            moveDirection.normalize();
            
            // Move character
            this.character.position.x += moveDirection.x * moveSpeed;
            this.character.position.z += moveDirection.z * moveSpeed;
            
            // Update character physics body
            this.characterBody.position.copy(this.character.position);
            
            // If holding ball, update ball position
            if (this.isHoldingBall) {
                this.ballBody.position.copy(this.character.position);
                this.ballBody.position.y += 1.5; // Hand level
                this.updateTrajectoryPreview();
            }
        }
    }

    updatePhysics(deltaTime) {
        // Update physics world
        this.physicsWorld.step(1/60, deltaTime, 3);
        
        // Handle character movement
        if (this.characterBody && this.character) {
            // Get camera direction for movement
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0;
            cameraDirection.normalize();

            // Get right vector from camera
            const cameraRight = new THREE.Vector3();
            cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0));

            // Calculate movement direction
            const moveDirection = new THREE.Vector3();

            // Check for key presses
            if (this.keyStates['w']) moveDirection.add(cameraDirection);
            if (this.keyStates['s']) moveDirection.sub(cameraDirection);
            if (this.keyStates['a']) moveDirection.sub(cameraRight);
            if (this.keyStates['d']) moveDirection.add(cameraRight);

            // Apply movement if there is input
            if (moveDirection.lengthSq() > 0) {
                moveDirection.normalize();
                
                // Apply reduced movement speed for tap-like movement
                const moveSpeed = 30;
                 // Reduced speed for small movements
                moveDirection.multiplyScalar(moveSpeed);
                
                // Apply velocity to character body
                this.characterBody.velocity.x = moveDirection.x;
                this.characterBody.velocity.z = moveDirection.z;
                
                // Rotate character to face movement direction
                const angle = Math.atan2(moveDirection.x, moveDirection.z);
                this.character.rotation.y = angle;
            } else {
                // Apply friction when no movement keys are pressed
                this.characterBody.velocity.x *= 0.8;
                this.characterBody.velocity.z *= 0.8;
            }

            // Handle jumping
            if (this.keyStates[' '] && this.characterBody.position.y <= 0.5) {
                const jumpForce = 10;
                this.characterBody.velocity.y = jumpForce;
            }
            
            // Update character position from physics
            this.character.position.copy(this.characterBody.position);
        }
        
        // Update ball position
        if (this.ball && this.ballBody) {
            this.ball.position.copy(this.ballBody.position);
            this.ball.quaternion.copy(this.ballBody.quaternion);
        }
        
        // Update trajectory visualization
        if (this.isThrown) {
            const timeElapsed = (performance.now() - this.throwStartTime) / 1000;
            const range = this.throwForce * Math.cos(this.throwAngle) * timeElapsed;
            const height = this.throwForce * Math.sin(this.throwAngle) * timeElapsed - 0.5 * this.gravity * timeElapsed * timeElapsed;

            this.flightData.range = range;
            this.flightData.maxHeight = Math.max(this.flightData.maxHeight, height);
            this.flightData.flightTime = timeElapsed;

            if (height < 0) {
                this.isThrown = false;
                this.landingMarker.position.copy(this.ball.position);
            }
        }
    }

    updateTrajectory() {
        if (!this.isAiming || !this.ball) return;

        // Get current character position and direction
        const position = new THREE.Vector3();
        position.copy(this.character.position);
        
        // Get camera direction (horizontal only)
        const direction = new THREE.Vector3();
        direction.copy(this.camera.getWorldDirection(new THREE.Vector3()));
        direction.y = 0;
        direction.normalize();

        // Calculate start position (slightly in front of character)
        const startPos = position.clone().add(direction.clone().multiplyScalar(1.5));
        startPos.y += 1.5; // Adjust for throw height
        
        // Store throw start position for distance calculation
        this.throwStartPosition.copy(startPos);
        
        // Calculate initial velocity components
        const vx = this.throwForce * Math.cos(this.throwAngle);
        const vy = this.throwForce * Math.sin(this.throwAngle);
        
        // Create points for trajectory line
        const points = [];
        const timeStep = 0.1;
        const maxTime = 5.0;
        let maxHeight = startPos.y;
        let landingPoint = null;
        
        for (let t = 0; t <= maxTime; t += timeStep) {
            const x = startPos.x + direction.x * vx * t;
            const z = startPos.z + direction.z * vx * t;
            const y = startPos.y + vy * t - (0.5 * 9.82 * t * t);
            
            // Update max height
            maxHeight = Math.max(maxHeight, y);
            
            // Check for ground collision
            if (y <= 0 && t > 0) {
                if (!landingPoint) {
                    landingPoint = new THREE.Vector3(x, 0.01, z);
                    this.updateLandingMarker(landingPoint);
                    
                    // Calculate theoretical range
                    this.flightData.theoreticalRange = Math.sqrt(
                        Math.pow(x - startPos.x, 2) + 
                        Math.pow(z - startPos.z, 2)
                    );
                    
                    // Calculate max height relative to start
                    this.flightData.maxHeight = maxHeight - startPos.y;
                    
                    // Calculate flight time to landing
                    this.flightData.theoreticalTime = t;
                }
                break;
            }
            
            points.push(new THREE.Vector3(x, y, z));
        }
        
        // Update trajectory line
        if (this.trajectoryLine) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.trajectoryLine.geometry.dispose();
            this.trajectoryLine.geometry = geometry;
            this.trajectoryLine.computeLineDistances();
            this.trajectoryLine.visible = true;
        }
        
        // Update flight data display
        this.displayFlightData();
    }

    throwBall() {
        if (!this.isHoldingBall || this.ballThrown) return;
        
        console.log("Throwing ball...");
        
        // Set initial position (from character's position if available)
        if (this.character) {
            this.ballBody.position.copy(this.character.position);
            this.ballBody.position.y += 1.5; // Raise to hand level
        } else {
            this.ballBody.position.set(0, 2, 0);
        }
        
        // Get camera direction (horizontal only)
        const direction = new THREE.Vector3();
        direction.copy(this.camera.getWorldDirection(new THREE.Vector3()));
        direction.y = 0;
        direction.normalize();
        
        // Calculate velocity components
        const vx = this.throwForce * Math.cos(this.throwAngle);
        const vy = this.throwForce * Math.sin(this.throwAngle);
        
        // Apply velocity in the direction of the trajectory
        this.ballBody.velocity.set(
            direction.x * vx,
            vy,
            direction.z * vx
        );
        
        // Update state
        this.isHoldingBall = false;
        this.ballThrown = true;
        
        // Hide trajectory and physics calculations
        this.trajectoryLine.visible = false;
        this.landingMarker.visible = false;
        this.hidePhysicsCalculations();
    }
    
    trackBallFlight() {
        // Create tracking data
        const trackingData = {
            startTime: performance.now(),
            startPosition: this.throwStartPosition.clone(),
            maxHeight: this.throwStartPosition.y,
            positions: [this.throwStartPosition.clone()],
            landed: false
        };
        
        // Start tracking interval
        const trackingInterval = setInterval(() => {
            if (!this.ball || !this.ballBody) {
                clearInterval(trackingInterval);
                return;
            }
            
            // Update max height
            if (this.ball.position.y > trackingData.maxHeight) {
                trackingData.maxHeight = this.ball.position.y;
            }
            
            // Store position for trajectory
            trackingData.positions.push(this.ball.position.clone());
            
            // Check if ball has landed (y position near ground)
            if (!trackingData.landed && this.ballBody.position.y < 0.5) {
                // Ball has landed and stopped
                setTimeout(() => this.resetBall(), 2000); // Reset after 2 seconds
            }

            // Update trajectory preview if holding ball
            if (this.isHoldingBall && !this.ballThrown) {
                this.updateTrajectoryPreview();
                this.updatePhysicsCalculations();
            }
        }, 16); // 60fps update rate
    }
    
    displayActualFlightData(flightTime, distance, maxHeight) {
        const physicsPanel = this.controls.physicsPanel;
        if (!physicsPanel) return;
        
        // Show the panel
        physicsPanel.style.display = 'block';
        
        // Calculate additional physics data
        const initialVelocity = this.throwForce;
        const angle = this.throwAngle * (180 / Math.PI); // Convert to degrees
        const gravity = Math.abs(this.physicsHandler.gravity.y);
        
        // Calculate theoretical values
        const theoreticalRange = (initialVelocity * initialVelocity * Math.sin(2 * this.throwAngle)) / gravity;
        const theoreticalMaxHeight = (initialVelocity * initialVelocity * Math.pow(Math.sin(this.throwAngle), 2)) / (2 * gravity);
        const theoreticalTime = (2 * initialVelocity * Math.sin(this.throwAngle)) / gravity;
        
        // Create step-by-step breakdown
        physicsPanel.innerHTML = `
            <h2 style="color: #4CAF50; margin: 0 0 15px 0; font-size: 18px;">Projectile Motion Analysis</h2>
            
            <div style="margin-bottom: 15px;">
                <h3 style="color: #2196F3; margin: 0 0 8px 0; font-size: 16px;">Step 1: Initial Conditions</h3>
                <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
                    • Initial Velocity (v₀): ${initialVelocity.toFixed(2)} m/s<br>
                    • Launch Angle (θ): ${angle.toFixed(2)}°<br>
                    • Gravity (g): ${gravity.toFixed(2)} m/s²
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h3 style="color: #2196F3; margin: 0 0 8px 0; font-size: 16px;">Step 2: Measured Results</h3>
                <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
                    • Distance: ${distance.toFixed(2)} m<br>
                    • Max Height: ${maxHeight.toFixed(2)} m<br>
                    • Flight Time: ${flightTime.toFixed(2)} s
                </div>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h3 style="color: #2196F3; margin: 0 0 8px 0; font-size: 16px;">Step 3: Theoretical Calculations</h3>
                <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px;">
                    <strong>Range (R):</strong><br>
                    R = (v₀² × sin(2θ)) / g<br>
                    R = ${theoreticalRange.toFixed(2)} m<br><br>
                    
                    <strong>Max Height (h):</strong><br>
                    h = (v₀² × sin²(θ)) / (2g)<br>
                    h = ${theoreticalMaxHeight.toFixed(2)} m<br><br>
                    
                    <strong>Flight Time (t):</strong><br>
                    t = (2 × v₀ × sin(θ)) / g<br>
                    t = ${theoreticalTime.toFixed(2)} s
                </div>
            </div>
            
            <div style="font-style: italic; color: #9E9E9E; font-size: 12px;">
                Note: Differences between measured and theoretical values are due to air resistance and other real-world factors.
            </div>
        `;
    }
    
    attachBallToCharacter() {
        if (!this.character || !this.ball) return;
        
        // Position the ball in the character's hand
        // Adjust these values based on your character model
        const handOffset = new THREE.Vector3(0.5, 1.5, 0.5);
        handOffset.applyQuaternion(this.character.quaternion);
        
        this.ball.position.copy(this.character.position).add(handOffset);
        
        // If using physics, update ball body position too
        if (this.ballBody) {
            this.ballBody.position.copy(this.ball.position);
            this.ballBody.velocity.set(0, 0, 0);
            this.ballBody.angularVelocity.set(0, 0, 0);
        }
    }
    
    pickupBall() {
        if (!this.character || !this.ball) {
            console.log("Cannot pick up ball - character or ball not found");
            return;
        }
        
        const distanceToball = this.character.position.distanceTo(this.ball.position);
        const pickupRange = 8.0;
        
        console.log("Distance to ball:", distanceToball, "Pickup range:", pickupRange);
        
        if (distanceToball <= pickupRange) {
            this.isHoldingBall = true;
            this.isThrown = false;
            this.attachBallToCharacter();
            
            // Reset aiming state
            this.isAiming = false;
            
            console.log("Ball picked up");
        } else {
            console.log("Ball is too far away to pick up");
        }
    }

    onMouseDown(event) {
        // Only handle left mouse button
        if (event.button !== 0) return;
        
        // Don't throw if clicking on UI elements
        if (event.target.tagName === 'BUTTON' || 
            event.target.tagName === 'INPUT' || 
            event.target.closest('.throw-control-container') || 
            event.target.closest('.flight-data-display')) {
            return;
        }
        
        // Check if aiming
        if (this.isAiming) {
            // Throw ball when clicking outside UI elements
            this.throwBall();
            console.log("Ball thrown via mouse click");
        }
    }

    onMouseMove(event) {
        // Only update angle if aiming
        if (this.isAiming) {
            // Get mouse position relative to center of screen
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const mouseX = event.clientX - centerX;
            const mouseY = centerY - event.clientY;
            
            // Calculate angle (in radians)
            let angle = Math.atan2(mouseY, mouseX);
            
            // Clamp angle between 0 and PI/2 (0 to 90 degrees)
            angle = Math.max(0, Math.min(Math.PI / 2, angle));
            
            // Update throw angle
            this.throwAngle = angle;
            
            // Update angle display if we have controls
            if (this.controls && this.controls.angleInput) {
                this.controls.angleInput.value = (angle * 180 / Math.PI).toFixed(1);
                this.controls.angleValue.textContent = (angle * 180 / Math.PI).toFixed(1) + '°';
            }
            
            // Update trajectory
            this.updateTrajectory();
            
            console.log("Mouse move angle: " + (angle * 180 / Math.PI).toFixed(1) + "°");
        }
    }

    onMouseUp(event) {
        // Check if aiming
        if (this.isAiming) {
            // Reset aiming flag
            this.isAiming = false;
        }
    }

    createControls() {
        const controlsContainer = document.createElement('div');
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.left = '20px';
        controlsContainer.style.top = '20px';
        controlsContainer.style.zIndex = '1000';

        // Create physics panel
        const physicsPanel = document.createElement('div');
        physicsPanel.id = 'physicsPanel';
        physicsPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        physicsPanel.style.color = 'white';
        physicsPanel.style.padding = '15px';
        physicsPanel.style.borderRadius = '8px';
        physicsPanel.style.marginTop = '10px';
        physicsPanel.style.width = '300px';
        physicsPanel.style.fontFamily = 'Arial, sans-serif';
        physicsPanel.style.display = 'none'; // Initially hidden
        physicsPanel.style.zIndex = '1000';

        // Store references
        this.controls = {
            physicsPanel
        };

        // Append elements
        controlsContainer.appendChild(physicsPanel);
        document.body.appendChild(controlsContainer);
    }

    async setup(planetName) {
        console.log('Setting up planet environment for:', planetName);
        try {
            // Initialize physics world
            this.setupPhysics();
            
            // Initialize physics handler
            this.physicsHandler = {
                throwBall: (body, position, velocity) => {
                    // Simple implementation that applies velocity directly to the body
                    body.position.copy(position);
                    body.velocity.copy(velocity);
                    body.angularVelocity.set(0, 0, 0);
                    body.type = CANNON.Body.DYNAMIC;
                    console.log("Ball thrown with velocity:", velocity);
                }
            };

            // Create planet-specific environment
            await this.createPlanetEnvironment(planetName);

            // Create character first
            this.createCharacter();
            console.log("Character created at position:", this.character ? this.character.position : "Character not created");

            // Create ball
            this.createBall();
            console.log("Ball created at position:", this.ball ? this.ball.position : "Ball not created");

            // Setup camera controls
            this.setupCameraControls();

            // Enable controls
            this.isInUpdateLoop = true;

            console.log('Planet environment setup complete');
        } catch (error) {
            console.error('Error setting up planet environment:', error);
            throw error;
        }
    }

    setupPhysics() {
        // Create physics world
        this.physicsWorld = new CANNON.World();
        this.physicsWorld.gravity.set(0, -9.82, 0);
        this.physicsWorld.broadphase = new CANNON.NaiveBroadphase();
        this.physicsWorld.solver.iterations = 10;
        this.physicsWorld.defaultContactMaterial.friction = 0.5;

        // Create materials
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.characterMaterial = new CANNON.Material('characterMaterial');
        this.ballMaterial = new CANNON.Material('ballMaterial');

        // Create contact materials
        const groundCharacterCM = new CANNON.ContactMaterial(
            this.groundMaterial,
            this.characterMaterial,
            {
                friction: 0.5,
                restitution: 0.3,
                contactEquationStiffness: 1e8,
                contactEquationRelaxation: 3
            }
        );

        const groundBallCM = new CANNON.ContactMaterial(
            this.groundMaterial,
            this.ballMaterial,
            {
                friction: 0.3,
                restitution: 0.6,
                contactEquationStiffness: 1e8,
                contactEquationRelaxation: 3
            }
        );

        this.physicsWorld.addContactMaterial(groundCharacterCM);
        this.physicsWorld.addContactMaterial(groundBallCM);
    }

    setupCameraControls() {
        // Use OrbitControls for free camera movement
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        
        // Make camera movement more responsive
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1; // Increased from 0.05
        this.controls.rotateSpeed = 1.5; // Faster rotation
        this.controls.zoomSpeed = 1.2; // Faster zoom
        this.controls.panSpeed = 1.5; // Faster panning
        
        // Set camera limits
        this.controls.minDistance = 5;
        this.controls.maxDistance = 100;
        this.controls.maxPolarAngle = Math.PI / 1.5; // Allow more vertical rotation
        
        // Enable smooth camera movement
        this.controls.enableSmoothing = true;
        this.controls.smoothingTime = 0.5;
    }

    async createPlanetEnvironment(planetName) {
        // Create space background with gradient
        const skyboxGeometry = new THREE.BoxGeometry(1000, 1000, 1000);
        const skyboxMaterial = new THREE.MeshBasicMaterial({
            color: 0x000020,
            side: THREE.BackSide,
            fog: false
        });
        const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
        this.scene.add(skybox);

        // Create flat plane surface
        const terrainSize = 200;
        const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize);

        // Create terrain material based on planet type
        let terrainMaterial;
        switch(planetName.toLowerCase()) {
            case 'mars':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0xc1440e,
                    roughness: 0.8,
                    metalness: 0.2
                });
                break;
            case 'moon':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.9,
                    metalness: 0.3
                });
                break;
            case 'mercury':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x8B7355,
                    roughness: 0.7,
                    metalness: 0.4
                });
                break;
            case 'venus':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0xFFA500,
                    roughness: 0.6,
                    metalness: 0.3
                });
                break;
            case 'earth':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x228B22,
                    roughness: 0.8,
                    metalness: 0.1
                });
                break;
            case 'jupiter':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0xDEB887,
                    roughness: 0.7,
                    metalness: 0.2
                });
                break;
            case 'saturn':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0xDAA520,
                    roughness: 0.6,
                    metalness: 0.3
                });
                break;
            case 'uranus':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x40E0D0,
                    roughness: 0.7,
                    metalness: 0.2
                });
                break;
            case 'neptune':
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x4169E1,
                    roughness: 0.7,
                    metalness: 0.3
                });
                break;
            default:
                terrainMaterial = new THREE.MeshStandardMaterial({
                    color: 0x808080,
                    roughness: 0.8,
                    metalness: 0.2
                });
        }

        // Create terrain mesh
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.receiveShadow = true;
        this.scene.add(terrain);
        this.terrain = terrain; // Store reference to terrain

        // Create terrain physics (flat plane)
        const terrainBody = new CANNON.Body({
            mass: 0,
            material: this.groundMaterial
        });
        const terrainShape = new CANNON.Plane();
        terrainBody.addShape(terrainShape);
        terrainBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.physicsWorld.addBody(terrainBody);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(ambientLight);

        // Add directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(100, 100, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        this.scene.add(sunLight);

        // Add stars
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });

        const starsVertices = [];
        for (let i = 0; i < 10000; i++) {
            const x = (Math.random() - 0.5) * 1000;
            const y = (Math.random() - 0.5) * 1000;
            const z = (Math.random() - 0.5) * 1000;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(stars);

        // Add fog for atmosphere
        this.scene.fog = new THREE.FogExp2(0x000020, 0.0015);
    }

    findHeightAtPosition(x, z) {
        // For a flat plane, the height is always 0
        return 0;
    }

    createCharacter() {
        // Create the character group
        this.character = new THREE.Group();

        // Create body parts with the human-like appearance - increased sizes
        const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
        const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });

        // Body - increased size
        const bodyGeometry = new THREE.CapsuleGeometry(1, 2, 4, 8); // Doubled size
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 2; // Adjusted for new size
        body.castShadow = true;

        // Head - increased size
        const headGeometry = new THREE.SphereGeometry(0.6, 16, 16); // Doubled size
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 4; // Adjusted for new size
        head.castShadow = true;

        // Arms - increased size
        const armGeometry = new THREE.CapsuleGeometry(0.3, 1.4, 4, 8); // Doubled size
        const leftArm = new THREE.Mesh(armGeometry, bodyMaterial);
        leftArm.position.set(-1.4, 2.4, 0); // Adjusted for new size
        leftArm.rotation.z = 0.2;
        leftArm.castShadow = true;

        const rightArm = new THREE.Mesh(armGeometry, bodyMaterial);
        rightArm.position.set(1.4, 2.4, 0); // Adjusted for new size
        rightArm.rotation.z = -0.2;
        rightArm.castShadow = true;

        // Legs - increased size
        const legGeometry = new THREE.CapsuleGeometry(0.4, 1.6, 4, 8); // Doubled size
        const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial);
        leftLeg.position.set(-0.6, 0.8, 0); // Adjusted for new size
        leftLeg.castShadow = true;

        const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial);
        rightLeg.position.set(0.6, 0.8, 0); // Adjusted for new size
        rightLeg.castShadow = true;

        // Add all parts to the character group
        this.character.add(body, head, leftArm, rightArm, leftLeg, rightLeg);

        // Position character on flat plane
        const startX = 0;
        const startZ = 0;
        const characterHeight = 2; // Height offset from ground
        
        // Position character on flat plane
        this.character.position.set(startX, characterHeight, startZ);
        this.scene.add(this.character);

        // Create physics body for character - increased size
        const characterShape = new CANNON.Cylinder(1, 1, 4, 8); // Doubled size
        this.characterBody = new CANNON.Body({
            mass: 10, // Increased mass for larger character
            material: this.characterMaterial,
            fixedRotation: true,
            position: new CANNON.Vec3(startX, characterHeight, startZ) // Match visual position
        });
        this.characterBody.addShape(characterShape);
        
        // Add character physics properties
        this.characterBody.linearDamping = 0.9;
        this.characterBody.angularDamping = 0.9;
        
        // Add collision event listeners
        this.characterBody.addEventListener('collide', (event) => {
            const contact = event.contact;
            const normalVelocity = contact.getImpactVelocityAlongNormal();
            
            if (normalVelocity < -5) {
                // Handle hard landing
                this.characterBody.velocity.scale(0.5, this.characterBody.velocity);
            }
        });

        this.physicsWorld.addBody(this.characterBody);
    }

    createBall() {
        // Remove existing ball if it exists
        if (this.ball) {
            this.scene.remove(this.ball);
        }
        if (this.ballBody) {
            this.physicsWorld.removeBody(this.ballBody);
        }
        
        // Create ball mesh - increased size
        const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32); // Increased from 0.2 to 0.5
        const ballMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xff4444,
            metalness: 0.5,
            roughness: 0.4
        });
        this.ball = new THREE.Mesh(ballGeometry, ballMaterial);
        this.ball.castShadow = true;
        this.ball.receiveShadow = true;
        
        // Position ball relative to character on flat plane
        const charPos = this.character ? this.character.position : new THREE.Vector3(0, 0, 0);
        const ballHeight = 0.5; // Ball radius
        
        // Position ball relative to character - moved closer for easier pickup
        this.ball.position.set(charPos.x + 2, ballHeight, charPos.z);
        this.scene.add(this.ball);

        // Create ball physics body - increased size
        const ballShape = new CANNON.Sphere(0.5); // Increased from 0.2 to 0.5
        this.ballBody = new CANNON.Body({
            mass: 2, // Increased mass for larger ball
            material: this.ballMaterial,
            position: new CANNON.Vec3(this.ball.position.x, this.ball.position.y, this.ball.position.z),
            linearDamping: 0.3,
            angularDamping: 0.3
        });
        this.ballBody.addShape(ballShape);

        // Add collision event listeners
        this.ballBody.addEventListener('collide', (event) => {
            const contact = event.contact;
            const normalVelocity = contact.getImpactVelocityAlongNormal();
            
            if (normalVelocity < -1) {
                // Add bounce effect
                this.ballBody.velocity.scale(0.8, this.ballBody.velocity);
                
                // Update landing position if this is the first collision after throw
                if (this.isThrown) {
                    this.isThrown = false;
                    this.updateLandingMarker(this.ball.position.clone());
                    this.updateFlightData();
                    this.displayFlightData();
                }
            }
        });

        this.physicsWorld.addBody(this.ballBody);
        
        // Ensure ball is visible
        this.ball.visible = true;
        
        // Create or update landing marker
        if (!this.landingMarker) {
            const markerGeometry = new THREE.RingGeometry(0.5, 0.6, 32);
            const markerMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                side: THREE.DoubleSide
            });
            this.landingMarker = new THREE.Mesh(markerGeometry, markerMaterial);
            this.landingMarker.rotation.x = -Math.PI / 2; // Lay flat on ground
            this.landingMarker.position.set(charPos.x + 2, 0.01, charPos.z); // Slightly above ground
            this.landingMarker.visible = false;
            this.scene.add(this.landingMarker);
        }
        
        // Create trajectory line if it doesn't exist
        if (!this.trajectoryLine) {
            this.createTrajectoryLine();
        }
        
        console.log("Ball created at position:", this.ball.position);
    }

    createTrajectoryLine() {
        // Create initial points for trajectory line
        const points = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(1, 1, 0),
            new THREE.Vector3(2, 0, 0)
        ];
        
        // Create geometry and set points
        const lineGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        
        points.forEach((point, i) => {
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
        });
        
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const lineMaterial = new THREE.LineDashedMaterial({
            color: 0x00ff00, // Bright green color
            dashSize: 2,     // Larger dash size
            gapSize: 1,      // Smaller gaps
            linewidth: 5,    // Thicker line (note: maximum thickness may be limited by WebGL)
            scale: 2,        // Scale up the dashes
            opacity: 0.8,    // Slightly transparent
            transparent: true
        });
        
        // Create line and add to scene
        this.trajectoryLine = new THREE.Line(lineGeometry, lineMaterial);
        this.trajectoryLine.computeLineDistances(); // Required for dashed lines
        this.trajectoryLine.visible = false;
        this.trajectoryLine.frustumCulled = false;
        this.scene.add(this.trajectoryLine);
        
        console.log("Trajectory line created with points:", points.length);
    }

    cleanup() {
        // Remove event listeners
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mouseup', this.onMouseUp);
        
        // Remove UI elements
        this.removeThrowControls();
        
        // Remove trajectory visualization
        if (this.trajectoryLine) {
            this.scene.remove(this.trajectoryLine);
        }
        if (this.landingMarker) {
            this.scene.remove(this.landingMarker);
        }
        
        // Remove flight data display
        this.removeFlightDataDisplay();
        
        this.isInUpdateLoop = false;
        
        // Remove character
        if (this.character) {
            this.scene.remove(this.character);
            this.character = null;
        }
        if (this.characterBody) {
            this.physicsWorld.removeBody(this.characterBody);
            this.characterBody = null;
        }

        // Remove ball
        if (this.ball) {
            this.scene.remove(this.ball);
            this.ball = null;
        }
        if (this.ballBody) {
            this.physicsWorld.removeBody(this.ballBody);
            this.ballBody = null;
        }
    }

    updateLandingMarker(position) {
        // Update landing marker position
        this.landingMarker.position.copy(position);
        this.landingMarker.position.y = 0.01; // Slightly above ground
        this.landingMarker.visible = true;
        
        // Calculate distance from throw start position
        const distance = this.throwStartPosition.distanceTo(position);
        this.flightData.range = distance;
    }
    
    updateFlightData() {
        // Calculate flight time
        const flightTime = (performance.now() - this.throwStartTime) / 1000;
        this.flightData.flightTime = flightTime;
        
        // Calculate initial velocity components
        const velocity = this.flightData.initialVelocity;
        const angle = this.flightData.angle;
        const vx = velocity * Math.cos(angle);
        const vy = velocity * Math.sin(angle);
        
        // Calculate theoretical maximum height
        const maxHeight = (vy * vy) / (2 * this.gravity);
        this.flightData.maxHeight = maxHeight;
        
        // Calculate theoretical range
        const range = (velocity * velocity * Math.sin(2 * angle)) / this.gravity;
        this.flightData.theoreticalRange = range;
    }
    
    displayFlightData() {
        // Create flight data display if it doesn't exist
        if (!this.flightDataDisplay) {
            this.flightDataDisplay = document.createElement('div');
            this.flightDataDisplay.className = 'flight-data-display';
            this.flightDataDisplay.style.position = 'absolute';
            this.flightDataDisplay.style.top = '10px';
            this.flightDataDisplay.style.right = '10px';
            this.flightDataDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            this.flightDataDisplay.style.color = 'white';
            this.flightDataDisplay.style.padding = '15px';
            this.flightDataDisplay.style.borderRadius = '10px';
            this.flightDataDisplay.style.fontFamily = 'Arial, sans-serif';
            this.flightDataDisplay.style.zIndex = '1000';
            this.flightDataDisplay.style.minWidth = '250px';
            document.body.appendChild(this.flightDataDisplay);
        }
        
        // Update flight data display
        this.flightDataDisplay.innerHTML = `
            <h3 style="margin: 0 0 10px 0; text-align: center; color: #00ffff;">Projectile Motion Data</h3>
            <div style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                <span>Initial Velocity:</span>
                <span>${this.flightData.initialVelocity.toFixed(2)} m/s</span>
            </div>
            <div style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                <span>Launch Angle:</span>
                <span>${(this.flightData.angle * 180 / Math.PI).toFixed(2)}°</span>
            </div>
            <div style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                <span>Predicted Flight Time:</span>
                <span>${this.flightData.flightTime.toFixed(2)} s</span>
            </div>
            <div style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                <span>Maximum Height:</span>
                <span>${this.flightData.maxHeight.toFixed(2)} m</span>
            </div>
            <div style="margin-bottom: 5px; display: flex; justify-content: space-between;">
                <span>Predicted Range:</span>
                <span>${this.flightData.theoreticalRange ? this.flightData.theoreticalRange.toFixed(2) : "0.00"} m</span>
            </div>
            <div style="margin-top: 10px; font-size: 0.9em; color: #aaaaaa; text-align: center;">
                ${this.isThrown ? "Projectile in flight" : this.isAiming ? "Aiming mode" : "Ready to aim"}
            </div>
        `;
    }
    
    removeFlightDataDisplay() {
        // Remove flight data display
        if (this.flightDataDisplay) {
            document.body.removeChild(this.flightDataDisplay);
            this.flightDataDisplay = null;
        }
    }
    
    removeThrowControls() {
        // Remove existing throw controls if they exist
        const existingControls = document.querySelector('.throw-control-container');
        if (existingControls) {
            document.body.removeChild(existingControls);
        }
    }
    
    toggleHoldBall() {
        // If the ball is in flight, we can't pick it up
        if (this.isThrown) {
            console.log("Cannot pick up ball - it's in flight");
            return;
        }
        
        // Toggle holding state
        this.isHoldingBall = !this.isHoldingBall;
        
        // Update button states
        if (this.controls) {
            if (this.controls.physicsPanel) {
                this.controls.physicsPanel.style.display = this.isHoldingBall ? 'block' : 'none';
            }
        }
        
        console.log("Ball holding state toggled. isHoldingBall:", this.isHoldingBall);
    }

    stopAiming() {
        // Reset aiming flag
        this.isAiming = false;
        
        // Hide trajectory line
        if (this.trajectoryLine) {
            this.trajectoryLine.visible = false;
        }
        
        // Update UI controls based on holding status
        if (this.controls && this.controls.physicsPanel) {
            // Update physics panel visibility
            this.controls.physicsPanel.style.display = 'none';
        }
        
        console.log("Aiming stopped");
    }

    clearTrajectoryPreview() {
        // Hide trajectory line
        if (this.trajectoryLine) {
            this.trajectoryLine.visible = false;
            
            // Reset geometry
            const geometry = this.trajectoryLine.geometry;
            geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            geometry.attributes.position.needsUpdate = true;
        }
        
        // Hide landing marker
        if (this.landingMarker) {
            this.landingMarker.visible = false;
        }
    }

    updateTrajectoryPreview() {
        if (!this.isHoldingBall) return;
        
        // Get current character position
        const startPos = new THREE.Vector3();
        if (this.character) {
            startPos.copy(this.character.position);
            startPos.y += 1.5; // Adjust for throw height
        } else {
            startPos.set(0, 2, 0);
        }
        
        // Get camera direction (horizontal only)
        const direction = new THREE.Vector3();
        direction.copy(this.camera.getWorldDirection(new THREE.Vector3()));
        direction.y = 0;
        direction.normalize();

        // Store throw start position for calculations
        this.throwStartPosition.copy(startPos);
        
        // Calculate initial velocity components
        const vx = this.throwForce * Math.cos(this.throwAngle);
        const vy = this.throwForce * Math.sin(this.throwAngle);
        
        // Create points for trajectory line
        const points = [];
        const timeStep = 0.1;
        const maxTime = 5.0;
        let maxHeight = startPos.y;
        let landingPoint = null;
        
        for (let t = 0; t <= maxTime; t += timeStep) {
            // Calculate position at time t along the trajectory
            const x = startPos.x + direction.x * vx * t;
            const z = startPos.z + direction.z * vx * t;
            const y = startPos.y + vy * t - (0.5 * 9.82 * t * t);
            
            // Update max height
            maxHeight = Math.max(maxHeight, y);
            
            // Check for ground collision
            if (y <= 0 && t > 0) {
                if (!landingPoint) {
                    landingPoint = new THREE.Vector3(x, 0.01, z);
                    this.updateLandingMarker(landingPoint);
                    
                    // Calculate theoretical range
                    this.flightData.theoreticalRange = Math.sqrt(
                        Math.pow(x - startPos.x, 2) + 
                        Math.pow(z - startPos.z, 2)
                    );
                    
                    // Calculate max height relative to start
                    this.flightData.maxHeight = maxHeight - startPos.y;
                    
                    // Calculate flight time to landing
                    this.flightData.theoreticalTime = t;
                }
                break;
            }
            
            points.push(new THREE.Vector3(x, y, z));
        }
        
        // Update trajectory line
        if (this.trajectoryLine) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            this.trajectoryLine.geometry.dispose();
            this.trajectoryLine.geometry = geometry;
            this.trajectoryLine.computeLineDistances();
            this.trajectoryLine.visible = true;
        }
        
        // Update flight data display
        this.updateFlightData();
    }

    updatePhysicsCalculations() {
        if (!this.isHoldingBall) return;
        
        const g = 9.82; // Gravity (m/s²)
        const v0 = this.throwForce; // Initial velocity magnitude
        const angle = this.throwAngle; // Launch angle in radians
        
        // Calculate physics values
        const v0x = v0 * Math.cos(angle);
        const v0y = v0 * Math.sin(angle);
        const timeOfFlight = (2 * v0y) / g;
        const range = v0x * timeOfFlight;
        const maxHeight = (v0y * v0y) / (2 * g);
        
        // Update UI with calculations
        const physicsElement = document.getElementById('physics-calculations');
        if (physicsElement) {
            physicsElement.innerHTML = `
                <div class="physics-value">Force: ${v0.toFixed(1)} m/s</div>
                <div class="physics-value">Angle: ${(angle * 180 / Math.PI).toFixed(1)}°</div>
                <div class="physics-value">Range (R): ${range.toFixed(2)} m</div>
                <div class="physics-formula">R = (v² × sin(2θ)) / g</div>
                <div class="physics-value">Time of Flight (T): ${timeOfFlight.toFixed(2)} s</div>
                <div class="physics-formula">T = (2 × v × sin(θ)) / g</div>
                <div class="physics-value">Max Height (H): ${maxHeight.toFixed(2)} m</div>
                <div class="physics-formula">H = (v² × sin²(θ)) / (2g)</div>
            `;
        }
        
        // Update flight data for display
        this.flightData.initialVelocity = v0;
        this.flightData.angle = angle;
        this.flightData.range = range;
        this.flightData.maxHeight = maxHeight;
        this.flightData.flightTime = timeOfFlight;
    }
    
    hidePhysicsCalculations() {
        const physicsElement = document.getElementById('physics-calculations');
        if (physicsElement) {
            physicsElement.innerHTML = '';
        }
    }
    
    resetBall() {
        // Reset ball state
        this.isHoldingBall = true;
        this.ballThrown = false;
        
        // Reset ball physics
        this.ballBody.velocity.set(0, 0, 0);
        this.ballBody.angularVelocity.set(0, 0, 0);
        
        // Position ball at character if available
        if (this.character) {
            this.attachBallToCharacter();
        } else {
            // If no character, position ball at origin
            if (this.ball) this.ball.position.set(0, 2, 0);
            if (this.ballBody) this.ballBody.position.set(0, 2, 0);
        }
        
        // Update visuals
        this.updateTrajectoryPreview();
        this.updatePhysicsCalculations();
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();
        if (this.keyStates.hasOwnProperty(key)) {
            this.keyStates[key] = true;
            
            // Handle special actions
            if (key === 'e') {
                console.log("E key pressed. isHoldingBall:", this.isHoldingBall);
                
                // E key to pick up or drop ball
                if (this.isHoldingBall) {
                    // Drop the ball if already holding it
                    this.isHoldingBall = false;
                    
                    // If we were aiming, stop aiming
                    if (this.isAiming) {
                        this.stopAiming();
                    }
                    
                    // Release the ball with a slight push forward
                    if (this.ballBody) {
                        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.character.quaternion);
                        this.ballBody.type = CANNON.Body.DYNAMIC;
                        this.ballBody.velocity.set(forward.x * 2, 0, forward.z * 2);
                    }
                    
                    console.log("Ball dropped");
                } else {
                    // Try to pick up the ball
                    console.log("Attempting to pick up ball");
                    this.pickupBall();
                }
            }
        }
    }

    onKeyUp(event) {
        const key = event.key.toLowerCase();
        if (this.keyStates.hasOwnProperty(key)) {
            this.keyStates[key] = false;
        }
    }

    onProjectileKeyDown(event) {
        const key = event.key.toLowerCase();
        if (this.projectileKeyStates.hasOwnProperty(key)) {
            this.projectileKeyStates[key] = true;
            
            // Handle immediate actions
            switch (key) {
                case 'arrowup':
                    this.throwAngle = Math.min(Math.PI / 2, this.throwAngle + 0.05);
                    break;
                case 'arrowdown':
                    this.throwAngle = Math.max(0.05, this.throwAngle - 0.05);
                    break;
                case 'w':
                    this.throwForce = Math.min(50, this.throwForce + 1);
                    break;
                case 's':
                    this.throwForce = Math.max(1, this.throwForce - 1);
                    break;
                case ' ': // Spacebar
                    if (this.isHoldingBall && !this.ballThrown) {
                        this.throwBall();
                    }
                    break;
            }
            
            // Update trajectory preview and physics calculations
            if (this.isHoldingBall) {
                this.updateTrajectoryPreview();
                this.updatePhysicsCalculations();
            }
        }
    }
    
    onProjectileKeyUp(event) {
        const key = event.key.toLowerCase();
        if (this.projectileKeyStates.hasOwnProperty(key)) {
            this.projectileKeyStates[key] = false;
        }
    }
}
