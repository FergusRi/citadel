import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const ENEMY_SPEED        = 2.5;   // world units per second
const ARRIVAL_THRESHOLD  = 1.5;   // despawn when this close to target
const WAVE_COUNT         = 6;     // enemies per wave
const MAP_EDGE           = 28;    // spawn radius from centre

const _bodyMat = new THREE.MeshLambertMaterial({ color: 0xcc2200 });
const _eyeMat  = new THREE.MeshLambertMaterial({ color: 0xffee00 });

function _buildEnemyMesh() {
  const g    = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 6), _bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
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

    this._onKey = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
  }

  setHallPos(pos) {
    this._hallPos = { x: pos.x, z: pos.z };
  }

  startWave() {
    if (this._active) return;
    this._active = true;
    this._waveIdx++;
    this._gameState.wave = this._waveIdx;

    // Spawn enemies evenly distributed around map edge
    for (let i = 0; i < WAVE_COUNT; i++) {
      const angle = (i / WAVE_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const ex    = Math.cos(angle) * MAP_EDGE;
      const ez    = Math.sin(angle) * MAP_EDGE;

      const mesh = _buildEnemyMesh();
      mesh.position.set(ex, 0, ez);
      this._scene.add(mesh);

      this._enemies.push({
        id:       `enemy_w${this._waveIdx}_${i}`,
        position: { x: ex, z: ez },
        health:   30,
        target:   { x: this._hallPos.x, z: this._hallPos.z },
        mesh,
        _alive:   true,
      });
    }
  }

  update(delta) {
    if (!this._active && this._enemies.length === 0) return;

    let allDead = true;

    for (const e of this._enemies) {
      if (!e._alive) continue;
      allDead = false;

      const dx   = e.target.x - e.position.x;
      const dz   = e.target.z - e.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist <= ARRIVAL_THRESHOLD) {
        this._despawn(e);
        continue;
      }

      const step    = Math.min(ENEMY_SPEED * delta, dist);
      e.position.x += (dx / dist) * step;
      e.position.z += (dz / dist) * step;
      e.mesh.position.set(e.position.x, 0, e.position.z);
      e.mesh.rotation.y = Math.atan2(dx, dz);
    }

    if (allDead) {
      this._enemies = this._enemies.filter(e => e._alive);
      this._active  = false;
    }
  }

  _despawn(e) {
    e._alive = false;
    this._scene.remove(e.mesh);
    e.mesh.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
  }

  _onKey(ev) {
    if (ev.code === 'Space') {
      ev.preventDefault();
      this.startWave();
    }
  }

  getEnemies() { return this._enemies.filter(e => e._alive); }
  isWaveActive() { return this._active; }
}
