import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const MAP_SIZE = 60;
const SEGMENTS = 60;
const CELL_SIZE = MAP_SIZE / SEGMENTS; // world-space distance between adjacent vertices (= 1.0)

// Terrain type constants
const T_GRASS = 0;
const T_WATER = 1;
const T_ROCK  = 2;

// Height thresholds for initial classification
const WATER_HEIGHT = -0.8;
const ROCK_HEIGHT  =  1.8;

// Minimum region sizes — smaller regions get converted to surrounding type
const MIN_WATER_REGION = 6;
const MIN_ROCK_REGION  = 4;

// Slope category constants
export const SLOPE_FLAT   = 0;
export const SLOPE_GENTLE = 1;
export const SLOPE_STEEP  = 2;

// Slope thresholds (gradient magnitude — rise over run in world units)
const SLOPE_FLAT_MAX   = 0.15;
const SLOPE_GENTLE_MAX = 0.45;

// Clearing generation settings
const PRIMARY_RADIUS         = 6;   // cell radius of starting clearing
const SECONDARY_RADIUS_LARGE = 4;
const SECONDARY_RADIUS_SMALL = 3;
const MIN_CLEARING_CELLS     = 5;   // reject a candidate if fewer usable cells than this

function noise(x, z, seed) {
  return (
    Math.sin(x * 0.15 + seed)       * Math.cos(z * 0.15 + seed)       * 2.5 +
    Math.sin(x * 0.4  + seed * 1.7) * Math.cos(z * 0.3  + seed)       * 1.0 +
    Math.sin(x * 0.8  + seed * 0.5) * Math.cos(z * 0.9  + seed * 2.1) * 0.4
  );
}

// BFS flood-fill: returns array of all [col, row] indices in the connected region
function floodFill(grid, cols, rows, startCol, startRow, targetType) {
  const key = (c, r) => r * cols + c;
  const visited = new Set();
  const region  = [];
  const queue   = [[startCol, startRow]];
  visited.add(key(startCol, startRow));

  while (queue.length > 0) {
    const [c, r] = queue.shift();
    region.push([c, r]);
    for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const k = key(nc, nr);
      if (!visited.has(k) && grid[k] === targetType) {
        visited.add(k);
        queue.push([nc, nr]);
      }
    }
  }
  return region;
}

// Find all connected regions of a given type; returns array of region arrays
function findRegions(grid, cols, rows, targetType) {
  const visited = new Uint8Array(cols * rows);
  const regions = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (grid[idx] === targetType && !visited[idx]) {
        const region = floodFill(grid, cols, rows, c, r, targetType);
        region.forEach(([rc, rr]) => { visited[rr * cols + rc] = 1; });
        regions.push(region);
      }
    }
  }
  return regions;
}

// For each cell in a small region, find the most common neighbour type outside the region
function dominantNeighbourType(grid, cols, rows, region, regionType) {
  const counts = { [T_GRASS]: 0, [T_WATER]: 0, [T_ROCK]: 0 };
  const inRegion = new Set(region.map(([c, r]) => r * cols + c));

  for (const [c, r] of region) {
    for (const [dc, dr] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const idx = nr * cols + nc;
      if (!inRegion.has(idx)) counts[grid[idx]]++;
    }
  }
  delete counts[regionType];
  return parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

// Compute gradient magnitude at (col, row) using central differences on the height array
function computeGradient(heights, cols, rows, col, row, cellSize) {
  const idx = (c, r) => r * cols + c;
  const c0 = Math.max(0, col - 1), c1 = Math.min(cols - 1, col + 1);
  const r0 = Math.max(0, row - 1), r1 = Math.min(rows - 1, row + 1);
  const dx = (heights[idx(c1, row)] - heights[idx(c0, row)]) / ((c1 - c0) * cellSize);
  const dz = (heights[idx(col, r1)] - heights[idx(col, r0)]) / ((r1 - r0) * cellSize);
  return Math.sqrt(dx * dx + dz * dz);
}

export class MapGenerator {
  constructor(scene, seed = 1) {
    this.scene          = scene;
    this.seed           = seed;
    this._resourceNodes = [];
    this._buildableGrid = new Map();  // "worldX,worldZ" -> true
    this._typeGrid      = null;       // Uint8Array [col + row*cols]
    this._slopeGrid     = null;       // Uint8Array [col + row*cols]
    this._slopeValues   = null;       // Float32Array [col + row*cols]
    this._clearings     = [];         // array of clearing objects
    this._clearingMask  = new Set();  // "col,row" keys for fast lookup
    this._gridCols      = SEGMENTS + 1;
    this._gridRows      = SEGMENTS + 1;
  }

  getSeed() { return this.seed; }

  bounds() { return { half: MAP_SIZE / 2 }; }

  getResourceNodes() { return this._resourceNodes; }

  isBuildable(gridX, gridZ) {
    return this._buildableGrid.get(`${gridX},${gridZ}`) === true;
  }

  // Returns terrain type (T_GRASS / T_WATER / T_ROCK) for a vertex grid position
  getTerrainType(col, row) {
    if (!this._typeGrid) return T_GRASS;
    const c = Math.max(0, Math.min(this._gridCols - 1, col));
    const r = Math.max(0, Math.min(this._gridRows - 1, row));
    return this._typeGrid[r * this._gridCols + c];
  }

  // Returns slope category (SLOPE_FLAT / SLOPE_GENTLE / SLOPE_STEEP) for a vertex grid position
  getSlopeType(col, row) {
    if (!this._slopeGrid) return SLOPE_FLAT;
    const c = Math.max(0, Math.min(this._gridCols - 1, col));
    const r = Math.max(0, Math.min(this._gridRows - 1, row));
    return this._slopeGrid[r * this._gridCols + c];
  }

  // Returns raw gradient magnitude for a vertex grid position
  getSlopeValue(col, row) {
    if (!this._slopeValues) return 0;
    const c = Math.max(0, Math.min(this._gridCols - 1, col));
    const r = Math.max(0, Math.min(this._gridRows - 1, row));
    return this._slopeValues[r * this._gridCols + c];
  }

  // Returns world-space center of the primary (starting) clearing
  getSpawnPoint() {
    const primary = this._clearings.find(cl => cl.isPrimary);
    return primary ? { x: primary.cx, z: primary.cz } : { x: 0, z: 0 };
  }

  // Returns all clearing objects: { id, cx, cz, radius, cells, isPrimary }
  getClearings() {
    return this._clearings;
  }

  // Returns true if the vertex grid position is inside any clearing
  isInClearing(col, row) {
    return this._clearingMask.has(`${col},${row}`);
  }

  generate() {
    this._buildTerrain();
    this._generateClearings();
    this._placeResourceNodes();
    this._placeWater();
    this._placeTrees();
  }

  _buildTerrain() {
    const cols = this._gridCols;
    const rows = this._gridRows;
    const geo  = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);

    const pos      = geo.attributes.position;
    const heights  = new Float32Array(pos.count);
    const typeGrid = new Uint8Array(cols * rows);

    // --- Pass 1: compute heights and classify terrain type ---
    for (let i = 0; i < pos.count; i++) {
      const x    = pos.getX(i);
      const z    = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const edgeFall   = Math.max(0, 1 - dist / (MAP_SIZE * 0.48));
      const centreFlat = Math.max(0, 1 - dist / 8);
      const h = noise(x, z, this.seed) * edgeFall;
      heights[i] = h * (1 - centreFlat * 0.9);

      const col = i % cols;
      const row = Math.floor(i / cols);
      if (heights[i] <= WATER_HEIGHT)     typeGrid[row * cols + col] = T_WATER;
      else if (heights[i] >= ROCK_HEIGHT) typeGrid[row * cols + col] = T_ROCK;
      else                                typeGrid[row * cols + col] = T_GRASS;
    }

    // --- Pass 2: BFS terrain type cleanup ---
    this._cleanupRegions(typeGrid, cols, rows, T_WATER, MIN_WATER_REGION);
    this._cleanupRegions(typeGrid, cols, rows, T_ROCK,  MIN_ROCK_REGION);
    this._typeGrid = typeGrid;

    // --- Pass 3: compute slope classification ---
    const slopeGrid = new Uint8Array(cols * rows);
    const slopeVals = new Float32Array(cols * rows);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const grad = computeGradient(heights, cols, rows, col, row, CELL_SIZE);
        const idx  = row * cols + col;
        slopeVals[idx] = grad;
        if      (grad <= SLOPE_FLAT_MAX)   slopeGrid[idx] = SLOPE_FLAT;
        else if (grad <= SLOPE_GENTLE_MAX) slopeGrid[idx] = SLOPE_GENTLE;
        else                               slopeGrid[idx] = SLOPE_STEEP;
      }
    }
    this._slopeGrid   = slopeGrid;
    this._slopeValues = slopeVals;

    // --- Pass 4: apply heights to geometry ---
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heights[i]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Per-vertex colours from terrain type
    const colors = new Float32Array(pos.count * 3);
    const grassC = new THREE.Color(0x3a5a2a);
    const waterC = new THREE.Color(0x1a6688);
    const rockC  = new THREE.Color(0x7a7060);

    for (let i = 0; i < pos.count; i++) {
      const col  = i % cols;
      const row  = Math.floor(i / cols);
      const type = typeGrid[row * cols + col];
      const c    = type === T_WATER ? waterC : type === T_ROCK ? rockC : grassC;
      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true })
    );
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    this.scene.add(mesh);
    this.terrainMesh = mesh;
  }

  // Remove all regions of targetType smaller than minSize by converting to dominant neighbour
  _cleanupRegions(typeGrid, cols, rows, targetType, minSize) {
    const regions = findRegions(typeGrid, cols, rows, targetType);
    for (const region of regions) {
      if (region.length < minSize) {
        const replacement = dominantNeighbourType(typeGrid, cols, rows, region, targetType);
        for (const [c, r] of region) {
          typeGrid[r * cols + c] = replacement;
        }
      }
    }
  }

  // Convert world-space coords to vertex grid col/row
  _worldToGrid(wx, wz) {
    return {
      col: Math.round((wx + MAP_SIZE / 2) / CELL_SIZE),
      row: Math.round((wz + MAP_SIZE / 2) / CELL_SIZE),
    };
  }

  // Perturb a base radius by angle to produce a natural, irregular outline
  _perturbRadius(base, angle, seedOff) {
    return base * (
      1 +
      0.28 * Math.sin(angle * 2.7 + seedOff * 0.11) *
             Math.cos(angle * 1.4 + seedOff * 0.07)
    );
  }

  // Build a single clearing centred at world (cx, cz).
  // isPrimary clearings allow steep cells (centre is already forced flat by height generation).
  // Returns a clearing object or null if the location is unusable.
  _buildClearing(cx, cz, radius, isPrimary, id) {
    const seedOff = this.seed + cx * 13.7 + cz * 7.3;
    const maxR    = Math.ceil(radius * 1.45);
    const cells   = [];

    for (let dz = -maxR; dz <= maxR; dz++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
        const wx = cx + dx * CELL_SIZE;
        const wz = cz + dz * CELL_SIZE;
        const { col, row } = this._worldToGrid(wx, wz);

        if (col < 0 || col >= this._gridCols || row < 0 || row >= this._gridRows) continue;

        const dist  = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);
        const r     = this._perturbRadius(radius, angle, seedOff);

        if (dist > r) continue;

        // Terrain checks — water is always excluded; steep only rejected for secondaries
        if (this.getTerrainType(col, row) === T_WATER) continue;
        if (!isPrimary && this.getSlopeType(col, row) === SLOPE_STEEP) continue;

        cells.push([col, row]);
      }
    }

    if (cells.length < MIN_CLEARING_CELLS) return null;

    return { id, cx, cz, radius, cells, isPrimary };
  }

  // Generate all clearings, populate _buildableGrid and _clearingMask
  _generateClearings() {
    const clearings = [];

    // Primary clearing — always at map centre (height generation forces it flat)
    const primary = this._buildClearing(0, 0, PRIMARY_RADIUS, true, 'primary');
    if (primary) clearings.push(primary);

    // Secondary candidate positions in world space
    const candidates = [
      { cx:  10, cz:  8,   r: SECONDARY_RADIUS_LARGE, id: 'sec_0' },
      { cx: -12, cz:  6,   r: SECONDARY_RADIUS_SMALL, id: 'sec_1' },
      { cx:   8, cz: -10,  r: SECONDARY_RADIUS_LARGE, id: 'sec_2' },
      { cx:  -9, cz:  -9,  r: SECONDARY_RADIUS_SMALL, id: 'sec_3' },
      { cx:  16, cz:  -5,  r: SECONDARY_RADIUS_SMALL, id: 'sec_4' },
      { cx:  -5, cz:  16,  r: SECONDARY_RADIUS_SMALL, id: 'sec_5' },
    ];

    for (const { cx, cz, r, id } of candidates) {
      const clearing = this._buildClearing(cx, cz, r, false, id);
      if (clearing) clearings.push(clearing);
    }

    this._clearings    = clearings;
    this._clearingMask = new Set();

    for (const clearing of clearings) {
      for (const [col, row] of clearing.cells) {
        // _buildableGrid key uses world-integer coords (col - 30 = worldX since CELL_SIZE=1)
        const worldX = col - this._gridCols / 2 + 0.5 | 0;
        const worldZ = row - this._gridRows / 2 + 0.5 | 0;
        this._buildableGrid.set(`${worldX},${worldZ}`, true);
        this._clearingMask.add(`${col},${row}`);
      }
    }
  }

  _placeResourceNodes() {
    const positions = [
      { x: 14, z: 0 }, { x: -14, z: 2 }, { x: 0, z: 14 }, { x: 0, z: -14 },
      { x: 10, z: 12 }, { x: -12, z: -10 },
    ];
    const treeMat  = new THREE.MeshLambertMaterial({ color: 0x2d6e2d });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });

    positions.forEach(({ x, z }) => {
      const node  = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), trunkMat);
      trunk.position.y = 0.6;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 7), treeMat);
      canopy.position.y = 2.0;
      node.add(trunk, canopy);
      node.position.set(x, 0, z);
      node.castShadow = true;
      node.userData   = { type: 'wood', amount: 40, id: `node_${x}_${z}` };
      this.scene.add(node);
      this._resourceNodes.push(node);
    });
  }

  _placeWater() {
    const geo  = new THREE.PlaneGeometry(6, 6);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ color: 0x1a6688, transparent: true, opacity: 0.75 })
    );
    mesh.position.set(18, 0.05, -8);
    this.scene.add(mesh);
  }

  _placeTrees() {
    const treeMat  = new THREE.MeshLambertMaterial({ color: 0x1e4d1e });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2e10 });
    const positions = [
      [-20, 15], [22, 10], [-18, -12], [16, -18],
      [-8, 20],  [5, 22],  [-22, 0],   [20, -2],
      [12, 16],  [-14, 18],[18, -14],
    ];
    positions.forEach(([x, z]) => {
      const g      = new THREE.Group();
      const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 5), trunkMat);
      trunk.position.y = 0.5;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.6, 6), treeMat);
      canopy.position.y = 1.7;
      g.add(trunk, canopy);
      g.position.set(x, 0, z);
      g.castShadow = true;
      this.scene.add(g);
    });
  }
}
