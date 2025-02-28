import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.145.0/build/three.module.js';
import { PlanetEnvironment } from './planetEnvironment.js';

export class PlanetScene {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.environment = null;
        this.clock = new THREE.Clock();
        this.transitionDuration = 1000; // ms
        this.isActive = false;
    }

    async setup(planetName) {
        try {
            // Cleanup any existing environment
            if (this.environment) {
                this.cleanup();
            }
            
            // Create planet environment
            this.environment = new PlanetEnvironment(this.scene, this.camera);
            await this.environment.setup(planetName);
            
            // Start the animation clock
            this.clock.start();
            this.isActive = true;
        } catch (error) {
            console.error('Error setting up planet scene:', error);
            this.cleanup(); // Clean up if setup fails
            throw error;
        }
    }

    update() {
        if (this.environment && this.isActive) {
            const deltaTime = this.clock.getDelta();
            this.environment.update(deltaTime);
        }
    }

    updateBallPosition(handPos) {
        if (this.environment && this.isActive) {
            this.environment.updateBallPosition(handPos);
        }
    }

    throwBall(velocity) {
        if (this.environment && this.isActive) {
            const throwData = this.environment.throwBall(velocity);
            // Reset ball after delay
            setTimeout(() => {
                if (this.environment && this.isActive) {
                    this.environment.resetBall();
                }
            }, 2000);
            return throwData;
        }
        return null;
    }

    cleanup() {
        if (this.environment) {
            this.environment.cleanup();
            this.environment = null;
        }
        this.isActive = false;
        this.clock.stop();
    }
}
