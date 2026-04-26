import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const WANDER_RADIUS        = 5.0;
const WALK_SPEED           = 1.2;
const WANDER_INTERVAL_MIN  = 1.5;
const WANDER_INTERVAL_MAX  = 4.0;
const ARRIVAL_THRESHOLD    = 0.35;
const GATHER_TIME          = 1.5;
const WOOD_PER_TRIP        = 5;
const STONE_PER_TRIP       = 3;
const IDLE_BEFORE_ASSIGN   = 0.5;
const DEFEND_ATTACK_RANGE  = 2.5;
const DEFEND_ATTACK_DAMAGE = 5;
const DEFEND_ATTACK_RATE   = 1.0; // seconds per swing

const BODY_COLORS = [0xc8855a, 0xb87040, 0xd49060, 0xa06535, 0xcc8055];

const _stumpMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });

function _buildStump() {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 6), _stumpMat);
  mesh.position.y = 0.14;
  mesh.castShadow = true;
  return mesh;
}

export class CitizenSystem {
  constructor(scene, gameState) {
    this.scene      = scene;
    this.gameState  = gameState;
    this._citizens  = [];
    this._hallPos   = { x: 0, z: 0 };
    this._woodNodes  = [];
    this._stoneNodes = [];
  }

  registerWoodNodes(resourceNodes) {
    this._woodNodes = resourceNodes
      .filter(n => n.userData.type === 'wood')
      .map(n => ({
        node:      n,
        state:     'active',
        remaining: n.userData.amount,
        max:       n.userData.amount,
        reserved:  null,
      }));

    this._stoneNodes = resourceNodes
      .filter(n => n.userData.type === 'stone')
      .map(n => ({
        node:      n,
        state:     'active',
        remaining: n.userData.amount,
        max:       n.userData.amount,
        reserved:  null,
      }));
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
        _idleTimer:   i * 0.3,
        _woodSlot:    null,
        _stoneSlot:   null,
        _resourceType: null,
        _guardPost:   null,   // reference to guard post building if assigned
        _attackTimer: 0,
      };

      this._citizens.push(citizen);
      this.gameState.citizens.push(citizen);
    }

    this.gameState.population.current = count;
    this.gameState.population.max     = count;
  }

  // Assign a citizen to a guard post (called by buildingPlacer after placing guard post)
  assignToGuardPost(guardPost) {
    const unassigned = this._citizens.find(c => c._guardPost === null);
    if (!unassigned) return null;
    unassigned._guardPost = guardPost;
    guardPost.assignedCitizen = unassigned;
    return unassigned;
  }

  update(delta, phase) {
    if (phase === 'game_over') return;

    if (phase === 'wave') {
      this._updateWavePhase(delta);
      return;
    }

    // Planning phase
    for (const c of this._citizens) {
      // Recover if reserved slot was depleted mid-transit
      if (c._woodSlot !== null && this._woodNodes[c._woodSlot].state === 'depleted') {
        this._releaseResourceSlot(c);
        c.state      = 'idle';
        c._idleTimer = 0;
      }
      if (c._stoneSlot !== null && this._stoneNodes[c._stoneSlot].state === 'depleted') {
        this._releaseResourceSlot(c);
        c.state      = 'idle';
        c._idleTimer = 0;
      }

      switch (c.state) {
        case 'idle':               this._updateIdle(c, delta);             break;
        case 'moving_to_resource': this._updateMovingToResource(c, delta); break;
        case 'gathering':          this._updateGathering(c, delta);        break;
        case 'returning':          this._updateReturning(c, delta);        break;
      }
    }
  }

  _updateWavePhase(delta) {
    for (const c of this._citizens) {
      if (c._guardPost !== null) {
        // Move to guard post then defend
        if (c.state !== 'defending' && c.state !== 'moving_to_guard') {
          this._releaseResourceSlot(c);
          c.state   = 'moving_to_guard';
          c._target = { x: c._guardPost.position.x, z: c._guardPost.position.z };
        }
        if (c.state === 'moving_to_guard') {
          this._moveTo(c, delta, c._target, () => { c.state = 'defending'; });
        }
        if (c.state === 'defending') {
          this._updateDefending(c, delta);
        }
      } else {
        // Shelter in town hall
        if (c.state !== 'sheltering' && c.state !== 'moving_to_shelter') {
          this._releaseResourceSlot(c);
          c.state   = 'moving_to_shelter';
          c._target = { x: this._hallPos.x, z: this._hallPos.z };
        }
        if (c.state === 'moving_to_shelter') {
          this._moveTo(c, delta, c._target, () => {
            c.state = 'sheltering';
            c.mesh.visible = false; // hide inside hall
          });
        }
      }
    }
  }

  _updateDefending(c, delta) {
    c._attackTimer -= delta;
    const enemies = this.gameState.enemies.filter(e => e._alive);
    if (enemies.length === 0) return;

    // Find nearest enemy in range
    let nearest = null, nearestDist = Infinity;
    for (const e of enemies) {
      const dx = e.position.x - c._guardPost.position.x;
      const dz = e.position.z - c._guardPost.position.z;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d < DEFEND_ATTACK_RANGE && d < nearestDist) {
        nearest = e; nearestDist = d;
      }
    }

    if (nearest && c._attackTimer <= 0) {
      nearest.health -= DEFEND_ATTACK_DAMAGE;
      c._attackTimer = DEFEND_ATTACK_RATE;
      if (nearest.health <= 0) nearest._alive = false;
    }
  }

  // Resume gathering after wave ends
  resumeAfterWave() {
    for (const c of this._citizens) {
      c.mesh.visible = true;
      if (c.state === 'sheltering' || c.state === 'defending' ||
          c.state === 'moving_to_shelter' || c.state === 'moving_to_guard') {
        c.state      = 'idle';
        c._idleTimer = Math.random() * 1.0;
      }
    }
  }

  _updateIdle(c, delta) {
    c._idleTimer -= delta;
    if (c._idleTimer > 0) { this._updateWander(c, delta); return; }

    // Prefer wood, then stone
    const woodSlot = this._findNearestFreeSlot(c, this._woodNodes);
    if (woodSlot !== null) {
      this._woodNodes[woodSlot].reserved = c.id;
      c._woodSlot    = woodSlot;
      c._resourceType = 'wood';
      c._target = {
        x: this._woodNodes[woodSlot].node.position.x,
        z: this._woodNodes[woodSlot].node.position.z,
      };
      c.state = 'moving_to_resource';
      return;
    }

    const stoneSlot = this._findNearestFreeSlot(c, this._stoneNodes);
    if (stoneSlot !== null) {
      this._stoneNodes[stoneSlot].reserved = c.id;
      c._stoneSlot    = stoneSlot;
      c._resourceType = 'stone';
      c._target = {
        x: this._stoneNodes[stoneSlot].node.position.x,
        z: this._stoneNodes[stoneSlot].node.position.z,
      };
      c.state = 'moving_to_resource';
      return;
    }

    c._idleTimer = IDLE_BEFORE_ASSIGN;
    this._updateWander(c, delta);
  }

  _updateMovingToResource(c, delta) {
    this._moveTo(c, delta, c._target, () => {
      c.state        = 'gathering';
      c._gatherTimer = GATHER_TIME;
    });
  }

  _updateGathering(c, delta) {
    c._gatherTimer -= delta;
    if (c._gatherTimer > 0) return;

    if (c._resourceType === 'wood' && c._woodSlot !== null) {
      const slot = this._woodNodes[c._woodSlot];
      slot.remaining = Math.max(0, slot.remaining - WOOD_PER_TRIP);
      if (slot.remaining <= 0 && slot.state === 'active') this._depleteWoodNode(c._woodSlot);
      this._releaseResourceSlot(c);
      c._resourceType = null;
      c.state   = 'returning';
      c._target = { x: this._hallPos.x, z: this._hallPos.z };
      c._carrying = 'wood';
    } else if (c._resourceType === 'stone' && c._stoneSlot !== null) {
      const slot = this._stoneNodes[c._stoneSlot];
      slot.remaining = Math.max(0, slot.remaining - STONE_PER_TRIP);
      if (slot.remaining <= 0 && slot.state === 'active') this._depleteStoneNode(c._stoneSlot);
      this._releaseResourceSlot(c);
      c._resourceType = null;
      c.state   = 'returning';
      c._target = { x: this._hallPos.x, z: this._hallPos.z };
      c._carrying = 'stone';
    }
  }

  _updateReturning(c, delta) {
    this._moveTo(c, delta, c._target, () => {
      if (c._carrying === 'wood')  this.gameState.addResource('wood', WOOD_PER_TRIP);
      if (c._carrying === 'stone') this.gameState.addResource('stone', STONE_PER_TRIP);
      c._carrying  = null;
      c.state      = 'idle';
      c._idleTimer = 0;
    });
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
    if (dist <= ARRIVAL_THRESHOLD) { onArrival(); return; }
    const step    = Math.min(WALK_SPEED * delta, dist);
    c.position.x += (dx / dist) * step;
    c.position.z += (dz / dist) * step;
    c.mesh.position.set(c.position.x, 0, c.position.z);
    c.mesh.rotation.y = Math.atan2(dx, dz);
  }

  _depleteWoodNode(slotIdx) {
    const slot  = this._woodNodes[slotIdx];
    slot.state    = 'depleted';
    slot.reserved = null;
    const group = slot.node;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.geometry.dispose();
    }
    group.add(_buildStump());
    group.userData.state = 'depleted';
  }

  _depleteStoneNode(slotIdx) {
    const slot  = this._stoneNodes[slotIdx];
    slot.state    = 'depleted';
    slot.reserved = null;
    const group = slot.node;
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.geometry.dispose();
    }
    group.userData.state = 'depleted';
  }

  _releaseResourceSlot(c) {
    if (c._woodSlot !== null && this._woodNodes[c._woodSlot]) {
      if (this._woodNodes[c._woodSlot].reserved === c.id)
        this._woodNodes[c._woodSlot].reserved = null;
    }
    if (c._stoneSlot !== null && this._stoneNodes[c._stoneSlot]) {
      if (this._stoneNodes[c._stoneSlot].reserved === c.id)
        this._stoneNodes[c._stoneSlot].reserved = null;
    }
    c._woodSlot  = null;
    c._stoneSlot = null;
  }

  _findNearestFreeSlot(c, nodes) {
    let best = null, bestDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const slot = nodes[i];
      if (slot.state !== 'active') continue;
      if (slot.reserved !== null)  continue;
      const n  = slot.node;
      const dx = n.position.x - c.position.x;
      const dz = n.position.z - c.position.z;
      const d  = dx * dx + dz * dz;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  getCitizens()   { return this._citizens;   }
  getWoodNodes()  { return this._woodNodes;  }
  getStoneNodes() { return this._stoneNodes; }
}
