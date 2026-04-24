import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// ── constants ────────────────────────────────────────────────────────────────

export const BuildingDefs = {
  lumberyard: {
    id:       'lumberyard',
    label:    'Lumberyard',
    woodCost: 10,
    size:     1,   // half-extents in world units for overlap check
  },
};

const MAT_VALID   = new THREE.MeshLambertMaterial({ color: 0x44ff44, transparent: true, opacity: 0.55 });
const MAT_INVALID = new THREE.MeshLambertMaterial({ color: 0xff2222, transparent: true, opacity: 0.55 });

// Ghost visual: simple box footprint + small roof
function _buildGhostMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 2.0), MAT_VALID);
  base.position.y = 0.7;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 4), MAT_VALID);
  roof.position.y = 1.85;
  roof.rotation.y = Math.PI / 4;
  g.add(base, roof);
  return g;
}

// Permanent lumberyard visual (distinct from ghost)
const _wallMat  = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
const _roofMat2 = new THREE.MeshLambertMaterial({ color: 0x5a3a0a });

function _buildLumberyardMesh() {
  const g    = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 2.0), _wallMat);
  base.position.y = 0.7;
  base.castShadow = base.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.9, 4), _roofMat2);
  roof.position.y = 1.85;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(base, roof);
  return g;
}

// ── BuildingPlacer ────────────────────────────────────────────────────────────

export class BuildingPlacer {
  constructor(scene, camera, canvas, mapGen, gameState) {
    this._scene     = scene;
    this._camera    = camera;
    this._canvas    = canvas;
    this._mapGen    = mapGen;
    this._gameState = gameState;

    this._active    = false;
    this._def       = null;
    this._ghost     = null;
    this._isValid   = false;
    this._curPos    = { x: 0, z: 0 };
    this._placedCount = 0;

    // Raycaster for mouse → terrain
    this._raycaster = new THREE.Raycaster();
    this._mouse     = new THREE.Vector2();

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onKey       = this._onKey.bind(this);

    window.addEventListener('keydown', this._onKey);
  }

  // Enter placement mode for a given building definition id ('lumberyard')
  startPlacement(defId) {
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
    if (this._ghost) {
      this._scene.remove(this._ghost);
      this._ghost = null;
    }
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('click',     this._onClick);
  }

  isActive() { return this._active; }

  // ── private ─────────────────────────────────────────────────────────────────

  _onKey(e) {
    if (e.key === 'l' || e.key === 'L') {
      if (this._active) { this.cancel(); return; }
      this.startPlacement('lumberyard');
    }
    if (e.key === 'Escape') this.cancel();
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

    const pt  = hits[0].point;
    // Snap to nearest integer world coords (matches buildableGrid keys)
    const wx  = Math.round(pt.x);
    const wz  = Math.round(pt.z);

    this._curPos = { x: wx, z: wz };
    this._ghost.position.set(wx, pt.y, wz);

    this._isValid = this._checkValid(wx, wz);
    const mat = this._isValid ? MAT_VALID : MAT_INVALID;
    this._ghost.traverse(child => {
      if (child.isMesh) child.material = mat;
    });
  }

  _checkValid(wx, wz) {
    const def = this._def;
    const gs  = this._gameState;

    // 1. Enough wood
    if (gs.resources.wood < def.woodCost) return false;

    // 2. Buildable cell (not water, not steep, inside a clearing)
    if (!this._mapGen.isBuildable(wx, wz)) return false;

    // 3. Not overlapping Settlement Hall or existing buildings
    const r = def.size + 1.0;   // 1-unit clearance buffer
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

    this._gameState.spendResource('wood', def.woodCost);

    const mesh = _buildLumberyardMesh();
    mesh.position.set(x, 0, z);
    this._scene.add(mesh);

    const building = {
      type:     def.id,
      position: { x, z },
      mesh,
      id:       `${def.id}_${this._placedCount++}`,
    };
    this._gameState.buildings.push(building);

    this.cancel();
  }
}
