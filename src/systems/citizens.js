import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const WANDER_RADIUS        = 5.0;
const WALK_SPEED           = 1.2;
const WANDER_INTERVAL_MIN  = 1.5;
const WANDER_INTERVAL_MAX  = 4.0;
const ARRIVAL_THRESHOLD    = 0.3;
const GATHER_TIME          = 1.5;  // seconds spent at the wood node
const WOOD_PER_TRIP        = 1;    // wood delivered per run
const IDLE_BEFORE_ASSIGN   = 0.5;  // seconds idle before auto-assigning

const BODY_COLORS = [0xc8855a, 0xb87040, 0xd49060, 0xa06535, 0xcc8055];

export class CitizenSystem {
  constructor(scene, gameState) {
    this.scene     = scene;
    this.gameState = gameState;
    this._citizens = [];
    this._hallPos  = { x: 0, z: 0 };
    this._woodNodes = [];       // { node, reserved: citizenId|null }
  }

  // Call once after map resources are available.
  registerWoodNodes(resourceNodes) {
    this._woodNodes = resourceNodes
      .filter(n => n.userData.type === 'wood')
      .map(n => ({ node: n, reserved: null }));
  }

  setHallPos(pos) {
    this._hallPos = { x: pos.x, z: pos.z };
  }

  spawnStartingCitizens(hallPos, count = 5) {
    this._hallPos = { x: hallPos.x, z: hallPos.z };
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf0c090 });

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.3;
      const dist  = 2.0 + (i % 3) * 0.5;
      const x     = hallPos.x + Math.cos(angle) * dist;
      const z     = hallPos.z + Math.sin(angle) * dist;

      const bodyMat = new THREE.MeshLambertMaterial({ color: BODY_COLORS[i % BODY_COLORS.length] });
      const group   = new THREE.Group();

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.58, 6), bodyMat);
      body.position.y = 0.29;
      body.castShadow = true;

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), headMat);
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
        _wanderTimer: i * 0.7,
        _gatherTimer: 0,
        _idleTimer:   i * 0.3,   // stagger initial assignment
        _woodSlot:    null,       // index into this._woodNodes
      };

      this._citizens.push(citizen);
      this.gameState.citizens.push(citizen);
    }

    this.gameState.population.current = count;
    this.gameState.population.max     = count;
  }

  update(delta, phase) {
    if (phase !== 'planning') return;

    for (const c of this._citizens) {
      switch (c.state) {

        case 'idle':
          this._updateIdle(c, delta);
          break;

        case 'moving_to_resource':
          this._moveTo(c, delta, c._target, () => {
            c.state        = 'gathering';
            c._gatherTimer = GATHER_TIME;
          });
          break;

        case 'gathering':
          c._gatherTimer -= delta;
          if (c._gatherTimer <= 0) {
            c.state   = 'returning';
            c._target = { x: this._hallPos.x, z: this._hallPos.z };
          }
          break;

        case 'returning':
          this._moveTo(c, delta, c._target, () => {
            this.gameState.addResource('wood', WOOD_PER_TRIP);
            this._releaseWoodSlot(c);
            c.state      = 'idle';
            c._idleTimer = 0;  // immediately look for next node
          });
          break;
      }
    }
  }

  // ─── private ────────────────────────────────────────────────────────────────

  _updateIdle(c, delta) {
    if (this._woodNodes.length > 0) {
      c._idleTimer -= delta;
      if (c._idleTimer <= 0) {
        const slot = this._findNearestFreeWoodSlot(c);
        if (slot !== null) {
          this._woodNodes[slot].reserved = c.id;
          c._woodSlot = slot;
          c._target   = {
            x: this._woodNodes[slot].node.position.x,
            z: this._woodNodes[slot].node.position.z,
          };
          c.state = 'moving_to_resource';
          return;
        }
        c._idleTimer = IDLE_BEFORE_ASSIGN;  // retry soon
      }
      return;
    }

    // No wood nodes registered yet — fall back to wander
    this._updateWander(c, delta);
  }

  _updateWander(c, delta) {
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

  _moveTo(c, delta, target, onArrival) {
    const dx   = target.x - c.position.x;
    const dz   = target.z - c.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= ARRIVAL_THRESHOLD) {
      onArrival();
      return;
    }
    const step    = Math.min(WALK_SPEED * delta, dist);
    c.position.x += (dx / dist) * step;
    c.position.z += (dz / dist) * step;
    c.mesh.position.set(c.position.x, 0, c.position.z);
    c.mesh.rotation.y = Math.atan2(dx, dz);
  }

  _findNearestFreeWoodSlot(c) {
    let best = null, bestDist = Infinity;
    for (let i = 0; i < this._woodNodes.length; i++) {
      if (this._woodNodes[i].reserved !== null) continue;
      const n  = this._woodNodes[i].node;
      const dx = n.position.x - c.position.x;
      const dz = n.position.z - c.position.z;
      const d  = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  _releaseWoodSlot(c) {
    if (c._woodSlot !== null && this._woodNodes[c._woodSlot]) {
      this._woodNodes[c._woodSlot].reserved = null;
    }
    c._woodSlot = null;
  }

  getCitizens() { return this._citizens; }
}
