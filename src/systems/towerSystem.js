import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ── Projectile visuals ────────────────────────────────────────────────────────
const _cannonBallMat  = new THREE.MeshLambertMaterial({ color: 0x222222 });
const _arrowMat       = new THREE.MeshLambertMaterial({ color: 0x8b5a00 });

function _makeCannonBall() {
  return new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), _cannonBallMat);
}
function _makeArrow() {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), _arrowMat);
  g.rotation.x = Math.PI / 2;
  return g;
}

// ── Tower config ──────────────────────────────────────────────────────────────
const TOWER_DEFS = {
  cannon_tower: {
    range:      9,
    damage:     25,
    fireRate:   2.5,   // seconds between shots
    projSpeed:  7,
    projFn:     _makeCannonBall,
  },
  archer_tower: {
    range:      12,
    damage:     10,
    fireRate:   1.0,
    projSpeed:  12,
    projFn:     _makeArrow,
  },
};

export class TowerSystem {
  constructor(scene, gameState) {
    this._scene     = scene;
    this._gameState = gameState;
    this._towers    = [];        // { building, def, cooldown, projectiles[] }
    this._projectiles = [];     // { mesh, target, speed, damage, pos }
  }

  // Called by buildingPlacer when a tower building is confirmed
  registerTower(building) {
    const def = TOWER_DEFS[building.type];
    if (!def) return;
    const entry = { building, def, cooldown: 0 };
    this._towers.push(entry);
    this._gameState.towers.push(entry);
  }

  update(delta) {
    if (this._gameState.phase !== 'wave') return;

    const enemies = this._gameState.enemies.filter(e => e._alive);

    // Fire towers
    for (const t of this._towers) {
      t.cooldown -= delta;
      if (t.cooldown > 0) continue;

      const tPos = t.building.position;
      let nearest = null, nearestDist = Infinity;

      for (const e of enemies) {
        const dx = e.position.x - tPos.x;
        const dz = e.position.z - tPos.z;
        const d  = Math.sqrt(dx * dx + dz * dz);
        if (d <= t.def.range && d < nearestDist) {
          nearest = e; nearestDist = d;
        }
      }

      if (nearest) {
        t.cooldown = t.def.fireRate;
        this._fireAt(t, nearest);
      }
    }

    // Move projectiles
    for (let i = this._projectiles.length - 1; i >= 0; i--) {
      const p = this._projectiles[i];
      if (!p.target._alive) {
        this._scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this._projectiles.splice(i, 1);
        continue;
      }

      const dx   = p.target.position.x - p.pos.x;
      const dz   = p.target.position.z - p.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.4) {
        // Hit
        p.target.health -= p.damage;
        if (p.target.health <= 0) p.target._alive = false;
        this._scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this._projectiles.splice(i, 1);
        continue;
      }

      const step = Math.min(p.speed * delta, dist);
      p.pos.x   += (dx / dist) * step;
      p.pos.z   += (dz / dist) * step;
      p.mesh.position.set(p.pos.x, 1.2, p.pos.z);
    }
  }

  _fireAt(tower, enemy) {
    const tPos = tower.building.position;
    const mesh = tower.def.projFn();
    mesh.position.set(tPos.x, 1.2, tPos.z);
    this._scene.add(mesh);

    this._projectiles.push({
      mesh,
      target: enemy,
      speed:  tower.def.projSpeed,
      damage: tower.def.damage,
      pos:    { x: tPos.x, z: tPos.z },
    });
  }

  clearProjectiles() {
    for (const p of this._projectiles) {
      this._scene.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this._projectiles = [];
  }
}
