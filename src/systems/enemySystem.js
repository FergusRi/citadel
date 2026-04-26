import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const ENEMY_SPEED       = 2.5;
const ARRIVAL_THRESHOLD = 1.5;
const MAP_EDGE          = 28;
const HALL_DAMAGE       = 20;   // damage dealt to hall on arrival
const ATTACK_RATE       = 1.2;  // seconds between hall attacks (once in range)

const _bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc2200 });
const _eyeMat  = new THREE.MeshLambertMaterial({ color: 0xffee00 });
const _deadMat = new THREE.MeshLambertMaterial({ color: 0x441100 });

function _buildEnemyMesh() {
  const g    = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 6), _bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  const eye  = new THREE.Mesh(new THREE.SphereGeometry(0.07, 4, 4), _eyeMat);
  eye.position.set(0.13, 0.82, 0.18);
  g.add(body, eye);
  return g;
}

export class EnemySystem {
  constructor(scene, gameState) {
    this._scene     = scene;
    this._gameState = gameState;
    this._enemies   = [];
    this._hallPos   = { x: 0, z: 0 };
    this._waveIdx   = 0;
    this._active    = false;
    this._deadQueue = [];   // { mesh, timer } for brief corpse flash

    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
  }

  setHallPos(pos) {
    this._hallPos = { x: pos.x, z: pos.z };
  }

  startWave() {
    if (this._active || this._gameState.phase === 'game_over') return;
    this._active = true;
    this._waveIdx++;
    this._gameState.wave = this._waveIdx;
    this._gameState.setPhase('wave');

    const count   = 4 + this._waveIdx * 2;          // scale with wave
    const hp      = 30 + (this._waveIdx - 1) * 15;  // enemies toughen up
    const speed   = Math.min(ENEMY_SPEED + (this._waveIdx - 1) * 0.2, 5.0);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const ex    = Math.cos(angle) * MAP_EDGE;
      const ez    = Math.sin(angle) * MAP_EDGE;

      const mesh = _buildEnemyMesh();
      mesh.position.set(ex, 0, ez);
      this._scene.add(mesh);

      const enemy = {
        id:           `enemy_w${this._waveIdx}_${i}`,
        position:     { x: ex, z: ez },
        health:       hp,
        maxHealth:    hp,
        speed,
        target:       { x: this._hallPos.x, z: this._hallPos.z },
        mesh,
        _alive:       true,
        _attackTimer: 0,
      };
      this._enemies.push(enemy);
      this._gameState.enemies.push(enemy);
    }
  }

  update(delta) {
    if (this._gameState.phase === 'game_over') return;

    // Tick death queue (brief red flash before removal)
    for (let i = this._deadQueue.length - 1; i >= 0; i--) {
      this._deadQueue[i].timer -= delta;
      if (this._deadQueue[i].timer <= 0) {
        this._scene.remove(this._deadQueue[i].mesh);
        this._deadQueue[i].mesh.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
        this._deadQueue.splice(i, 1);
      }
    }

    if (!this._active && this._enemies.length === 0) return;

    let anyAlive = false;

    for (const e of this._enemies) {
      if (!e._alive) continue;

      // Kill check
      if (e.health <= 0) {
        this._killEnemy(e);
        continue;
      }

      anyAlive = true;

      const dx   = e.target.x - e.position.x;
      const dz   = e.target.z - e.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= ARRIVAL_THRESHOLD) {
        // Attack hall
        e._attackTimer -= delta;
        if (e._attackTimer <= 0) {
          this._gameState.damageHall(HALL_DAMAGE);
          e._attackTimer = ATTACK_RATE;
        }
        continue;
      }

      const step    = Math.min(e.speed * delta, dist);
      e.position.x += (dx / dist) * step;
      e.position.z += (dz / dist) * step;
      e.mesh.position.set(e.position.x, 0, e.position.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
    }

    if (!anyAlive && this._active) {
      this._enemies = [];
      this._gameState.enemies.length = 0;
      this._active  = false;
      this._gameState.setPhase('planning');
      this._gameState._emit('waveEnd', this._waveIdx);
    }
  }

  _killEnemy(e) {
    e._alive = false;
    // Tint dark red briefly, then remove
    e.mesh.traverse(c => {
      if (c.isMesh) c.material = _deadMat;
    });
    this._deadQueue.push({ mesh: e.mesh, timer: 0.25 });
  }

  _onKey(ev) {
    if (ev.code === 'Space' && this._gameState.phase === 'planning') {
      ev.preventDefault();
      this.startWave();
    }
  }

  getEnemies()   { return this._enemies.filter(e => e._alive); }
  isWaveActive() { return this._active; }
}
