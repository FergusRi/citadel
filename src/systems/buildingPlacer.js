import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ── Building definitions ──────────────────────────────────────────────────────
export const BuildingDefs = {
  cannon_tower: { id: 'cannon_tower', label: 'Cannon Tower', woodCost: 20, stoneCost: 0, size: 1 },
  archer_tower: { id: 'archer_tower', label: 'Archer Tower', woodCost: 15, stoneCost: 0, size: 1 },
  guard_post:   { id: 'guard_post',   label: 'Guard Post',   woodCost: 10, stoneCost: 0, size: 1 },
  lumberyard:   { id: 'lumberyard',   label: 'Wood Camp',    woodCost: 10, stoneCost: 0, size: 1 },
};

// ── Ghost materials ───────────────────────────────────────────────────────────
const MAT_VALID   = new THREE.MeshLambertMaterial({ color: 0x44ff44, transparent: true, opacity: 0.55 });
const MAT_INVALID = new THREE.MeshLambertMaterial({ color: 0xff2222, transparent: true, opacity: 0.55 });

// ── Permanent building mesh builders ─────────────────────────────────────────
const _mats = {
  cannon_base:   new THREE.MeshLambertMaterial({ color: 0x555566 }),
  cannon_barrel: new THREE.MeshLambertMaterial({ color: 0x333344 }),
  archer_base:   new THREE.MeshLambertMaterial({ color: 0x8b7040 }),
  archer_roof:   new THREE.MeshLambertMaterial({ color: 0x5a3010 }),
  guard_base:    new THREE.MeshLambertMaterial({ color: 0x7a6a50 }),
  guard_flag:    new THREE.MeshLambertMaterial({ color: 0xdd2222 }),
  lumber_wall:   new THREE.MeshLambertMaterial({ color: 0x8b6914 }),
  lumber_roof:   new THREE.MeshLambertMaterial({ color: 0x5a3a0a }),
};

function _buildCannonMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 1.2, 8), _mats.cannon_base);
  base.position.y = 0.6; base.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.0, 6), _mats.cannon_barrel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 1.1, 0.5);
  barrel.castShadow = true;
  g.add(base, barrel);
  return g;
}

function _buildArcherMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.6), _mats.archer_base);
  base.position.y = 1.0; base.castShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.8, 4), _mats.archer_roof);
  roof.position.y = 2.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(base, roof);
  return g;
}

function _buildGuardMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), _mats.guard_base);
  base.position.y = 0.5; base.castShadow = true;
  // flag pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4),
    new THREE.MeshLambertMaterial({ color: 0x5a3a0a }));
  pole.position.set(0.5, 1.7, 0.5);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), _mats.guard_flag);
  flag.position.set(0.75, 2.2, 0.5);
  g.add(base, pole, flag);
  return g;
}

function _buildLumberyardMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 2.0), _mats.lumber_wall);
  base.position.y = 0.7; base.castShadow = base.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 4), _mats.lumber_roof);
  roof.position.y = 1.85; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(base, roof);
  return g;
}

const MESH_BUILDERS = {
  cannon_tower: _buildCannonMesh,
  archer_tower: _buildArcherMesh,
  guard_post:   _buildGuardMesh,
  lumberyard:   _buildLumberyardMesh,
};

function _buildGhostMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 2.0), MAT_VALID);
  base.position.y = 0.7;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 4), MAT_VALID);
  roof.position.y = 1.85; roof.rotation.y = Math.PI / 4;
  g.add(base, roof);
  return g;
}

// ── BuildingPlacer ────────────────────────────────────────────────────────────
export class BuildingPlacer {
  constructor(scene, camera, canvas, mapGen, gameState, citizenSystem, towerSystem) {
    this._scene         = scene;
    this._camera        = camera;
    this._canvas        = canvas;
    this._mapGen        = mapGen;
    this._gameState     = gameState;
    this._citizenSystem = citizenSystem;
    this._towerSystem   = towerSystem;

    this._active      = false;
    this._def         = null;
    this._ghost       = null;
    this._isValid     = false;
    this._curPos      = { x: 0, z: 0 };
    this._curY        = 0;
    this._placedCount = 0;

    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onKey       = this._onKey.bind(this);
    window.addEventListener('keydown', this._onKey);
  }

  startPlacement(defId) {
    if (this._gameState.phase !== 'planning') return;
    const def = BuildingDefs[defId];
    if (!def) return;
    if (this._active) this.cancel();
    this._def    = def;
    this._active = true;
    this._ghost  = _buildGhostMesh();
    this._scene.add(this._ghost);
    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('click',     this._onClick);
  }

  cancel() {
    if (!this._active) return;
    this._active = false;
    this._def    = null;
    if (this._ghost) { this._scene.remove(this._ghost); this._ghost = null; }
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('click',     this._onClick);
  }

  isActive() { return this._active; }

  _onKey(e) {
    if (e.key === 'Escape') { this.cancel(); return; }
    // Number hotkeys for HUD buttons — handled by hud.js calling startPlacement
  }

  _onMouseMove(e) {
    if (!this._active) return;
    const rect = this._canvas.getBoundingClientRect();
    this._mouse.set(
      ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      -((e.clientY - rect.top)  / rect.height) * 2 + 1,
    );
    this._updateGhost();
  }

  _onClick(e) {
    if (!this._active || !this._isValid) return;
    e.stopPropagation();
    this._confirmPlacement();
  }

  _updateGhost() {
    const terrain = this._scene.getObjectByName('terrain');
    if (!terrain) return;
    this._raycaster.setFromCamera(this._mouse, this._camera);
    const hits = this._raycaster.intersectObject(terrain);
    if (hits.length === 0) return;
    const pt = hits[0].point;
    const wx = Math.round(pt.x);
    const wz = Math.round(pt.z);
    this._curPos = { x: wx, z: wz };
    this._curY   = pt.y;
    this._ghost.position.set(wx, pt.y, wz);
    this._isValid = this._checkValid(wx, wz);
    const mat = this._isValid ? MAT_VALID : MAT_INVALID;
    this._ghost.traverse(child => { if (child.isMesh) child.material = mat; });
  }

  _checkValid(wx, wz) {
    const def = this._def;
    const gs  = this._gameState;
    if (gs.resources.wood < def.woodCost) return false;
    if ((gs.resources.stone || 0) < (def.stoneCost || 0)) return false;
    if (!this._mapGen.isBuildable(wx, wz)) return false;
    const r = def.size + 1.0;
    for (const b of gs.buildings) {
      const dx = b.position.x - wx;
      const dz = b.position.z - wz;
      if (Math.abs(dx) < r && Math.abs(dz) < r) return false;
    }
    return true;
  }

  _confirmPlacement() {
    const { x, z } = this._curPos;
    const def       = this._def;

    this._gameState.spendResource('wood',  def.woodCost);
    if (def.stoneCost) this._gameState.spendResource('stone', def.stoneCost);

    const builder = MESH_BUILDERS[def.id] || _buildLumberyardMesh;
    const mesh    = builder();
    mesh.position.set(x, this._curY, z);
    this._scene.add(mesh);

    const building = {
      type:             def.id,
      position:         { x, z },
      mesh,
      id:               `${def.id}_${this._placedCount++}`,
      assignedCitizen:  null,
    };
    this._gameState.buildings.push(building);

    // Register with appropriate system
    if (def.id === 'cannon_tower' || def.id === 'archer_tower') {
      this._towerSystem.registerTower(building);
    }
    if (def.id === 'guard_post') {
      this._gameState.guardPosts.push(building);
      this._citizenSystem.assignToGuardPost(building);
    }

    this.cancel();
  }
}
