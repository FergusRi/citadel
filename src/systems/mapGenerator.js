import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const MAP_SIZE = 60;
const GRID = 1;
const SEGMENTS = 60;

// Simple noise using layered sine waves (no deps needed)
function noise(x, z, seed = 1) {
  return (
    Math.sin(x * 0.15 + seed) * Math.cos(z * 0.15 + seed) * 2.5 +
    Math.sin(x * 0.4 + seed * 1.7) * Math.cos(z * 0.3 + seed) * 1.0 +
    Math.sin(x * 0.8 + seed * 0.5) * Math.cos(z * 0.9 + seed * 2.1) * 0.4
  );
}

export class MapGenerator {
  constructor(scene) {
    this.scene = scene;
    this.resourceNodes = [];
    this.buildableGrid = new Map(); // "x,z" -> boolean
  }

  generate() {
    this._buildTerrain();
    this._markClearings();
    this._placeResourceNodes();
    this._placeWater();
    this._placeTrees();
  }

  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const edgeFall = Math.max(0, 1 - dist / (MAP_SIZE * 0.48));
      const h = noise(x, z) * edgeFall;
      // flatten centre clearing for settlement
      const centreDist = Math.sqrt(x * x + z * z);
      const centreFlat = Math.max(0, 1 - centreDist / 8);
      pos.setY(i, h * (1 - centreFlat * 0.9));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({
      color: 0x3a5a2a,
      wireframe: false,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrainMesh = mesh;
  }

  _markClearings() {
    // Mark a 10x10 centre area as buildable
    for (let x = -5; x <= 5; x++) {
      for (let z = -5; z <= 5; z++) {
        this.buildableGrid.set(`${x},${z}`, true);
      }
    }
    // A few scattered clearings
    const clearings = [
      { cx: 10, cz: 8, r: 3 },
      { cx: -12, cz: 6, r: 2 },
      { cx: 8, cz: -10, r: 3 },
      { cx: -9, cz: -9, r: 2 },
    ];
    clearings.forEach(({ cx, cz, r }) => {
      for (let x = cx - r; x <= cx + r; x++) {
        for (let z = cz - r; z <= cz + r; z++) {
          if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) {
            this.buildableGrid.set(`${x},${z}`, true);
          }
        }
      }
    });
  }

  _placeResourceNodes() {
    const positions = [
      { x: 14, z: 0 }, { x: -14, z: 2 }, { x: 0, z: 14 }, { x: 0, z: -14 },
      { x: 10, z: 12 }, { x: -12, z: -10 },
    ];
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d6e2d });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });

    positions.forEach(({ x, z }) => {
      const node = new THREE.Group();

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), trunkMat);
      trunk.position.y = 0.6;
      node.add(trunk);

      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), treeMat);
      canopy.position.y = 2.0;
      node.add(canopy);

      node.position.set(x, 0, z);
      node.castShadow = true;
      node.userData = { type: 'wood', amount: 40, id: `node_${x}_${z}` };
      this.scene.add(node);
      this.resourceNodes.push(node);
    });
  }

  _placeWater() {
    const geo = new THREE.PlaneGeometry(6, 6);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1a6688, transparent: true, opacity: 0.75 });
    const water = new THREE.Mesh(geo, mat);
    water.position.set(18, 0.05, -8);
    this.scene.add(water);
  }

  _placeTrees() {
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1e4d1e });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2e10 });
    const positions = [
      [-20, 15], [22, 10], [-18, -12], [16, -18],
      [-8, 20], [5, 22], [-22, 0], [20, -2],
      [12, 16], [-14, 18], [18, -14],
    ];
    positions.forEach(([x, z]) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 5), trunkMat);
      trunk.position.y = 0.5;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 6), treeMat);
      canopy.position.y = 1.7;
      g.add(trunk, canopy);
      g.position.set(x, 0, z);
      g.castShadow = true;
      this.scene.add(g);
    });
  }

  isBuildable(gridX, gridZ) {
    return this.buildableGrid.get(`${gridX},${gridZ}`) === true;
  }
}
