import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Building type constants
export const BuildingType = {
  SETTLEMENT_HALL: 'settlement_hall',
};

export class Settlement {
  constructor(scene, gameState) {
    this.scene     = scene;
    this.gameState = gameState;
    this.buildings = [];   // tracked building data objects
  }

  // Spawn the starting Settlement Hall at the validated map spawn point.
  // Returns the building data object.
  spawnHall(spawnPoint) {
    const { x, z } = spawnPoint;

    // Visual: stone base platform + tower body + roof cap
    const group = new THREE.Group();

    const baseMat  = new THREE.MeshLambertMaterial({ color: 0x8a7a60 });
    const wallMat  = new THREE.MeshLambertMaterial({ color: 0xb09a70 });
    const roofMat  = new THREE.MeshLambertMaterial({ color: 0x7a3a20 });
    const flagMat  = new THREE.MeshLambertMaterial({ color: 0xcc4422 });

    // Base platform
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.4, 3.0), baseMat);
    base.position.y = 0.2;
    base.castShadow    = true;
    base.receiveShadow = true;

    // Hall body
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, 2.2), wallMat);
    body.position.y = 1.4;
    body.castShadow    = true;
    body.receiveShadow = true;

    // Roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.4, 4), roofMat);
    roof.position.y = 3.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    // Flag pole
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
    const pole    = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), poleMat);
    pole.position.y = 4.4;

    // Flag banner
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), flagMat);
    flag.position.set(0.3, 4.95, 0);

    group.add(base, body, roof, pole, flag);
    group.position.set(x, 0, z);
    group.castShadow = true;

    this.scene.add(group);

    const buildingData = {
      type:     BuildingType.SETTLEMENT_HALL,
      position: { x, z },
      mesh:     group,
      id:       'hall_0',
    };

    this.buildings.push(buildingData);
    this.gameState.buildings.push(buildingData);

    return buildingData;
  }

  getBuildings() { return this.buildings; }
}
