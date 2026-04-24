export class Context {
  constructor({ renderer, camera, gameState, mapGen, settlement, citizenSystem, buildingPlacer, seed }) {
    this.renderer       = renderer;
    this.camera         = camera;
    this.gameState      = gameState;
    this.mapGen         = mapGen;
    this.settlement     = settlement;
    this.citizenSystem  = citizenSystem;
    this.buildingPlacer = buildingPlacer;
    this.seed           = seed; // active seed; readable by any system via ctx.seed
  }
}
