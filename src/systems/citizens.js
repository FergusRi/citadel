import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const WANDER_RADIUS        = 5.0;  // max distance from hall centre to wander
const WALK_SPEED           = 1.2;  // world units per second
const WANDER_INTERVAL_MIN  = 1.5;  // seconds before picking a new target (min)
const WANDER_INTERVAL_MAX  = 4.0;  // seconds before picking a new target (max)
const ARRIVAL_THRESHOLD    = 0.15; // stop moving when this close to target

const BODY_COLORS = [0xc8855a, 0xb87040, 0xd49060, 0xa06535, 0xcc8055];

export class CitizenSystem {
  constructor(scene, gameState) {
    this.scene     = scene;
    this.gameState = gameState;
    this._citizens = [];
    this._hallPos  = { x: 0, z: 0 };
  }

  // Spawn `count` citizens arranged around the hall position.
  spawnStartingCitizens(hallPos, count = 5) {
    this._hallPos = { x: hallPos.x, z: hallPos.z };

    const headMat = new THREE.MeshLambertMaterial({ color: 0xf0c090 });

    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2 + 0.3;
      const dist   = 2.0 + (i % 3) * 0.5;  // 2.0–3.0 units from hall, clear of base
      const x      = hallPos.x + Math.cos(angle) * dist;
      const z      = hallPos.z + Math.sin(angle) * dist;

      const bodyMat = new THREE.MeshLambertMaterial({ color: BODY_COLORS[i % BODY_COLORS.length] });

      const group = new THREE.Group();
      const body  = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.58, 6), bodyMat);
      body.position.y = 0.29;
      body.castShadow = true;
      const head  = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), headMat);
      head.position.y = 0.78;
      head.castShadow = true;
      group.add(body, head);
      group.position.set(x, 0, z);
      this.scene.add(group);

      const citizen = {
        id:           `citizen_${i}`,
        position:     { x, z },
        state:        'idle',
        mesh:         group,
        _target:      { x, z },
        _wanderTimer: i * 0.7,  // stagger so they don't all turn at once
      };

      this._citizens.push(citizen);
      this.gameState.citizens.push(citizen);
    }

    this.gameState.population.current = count;
    this.gameState.population.max     = count;
  }

  // Called every frame from the game loop. Only moves citizens during planning phase.
  update(delta, phase) {
    if (phase !== 'planning') return;

    for (const c of this._citizens) {
      c._wanderTimer -= delta;

      if (c._wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * WANDER_RADIUS;
        c._target = {
          x: this._hallPos.x + Math.cos(angle) * dist,
          z: this._hallPos.z + Math.sin(angle) * dist,
        };
        c._wanderTimer = WANDER_INTERVAL_MIN +
          Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
      }

      const dx   = c._target.x - c.position.x;
      const dz   = c._target.z - c.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > ARRIVAL_THRESHOLD) {
        const step    = Math.min(WALK_SPEED * delta, dist);
        c.position.x += (dx / dist) * step;
        c.position.z += (dz / dist) * step;
        c.mesh.position.set(c.position.x, 0, c.position.z);
        c.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
  }

  getCitizens() { return this._citizens; }
}
