export class Context {
  constructor({ renderer, camera, gameState, mapGen, settlement, citizenSystem, seed }) {
    this.renderer      = renderer;
    this.camera        = camera;
    this.gameState     = gameState;
    this.mapGen        = mapGen;
    this.settlement    = settlement;
    this.citizenSystem = citizenSystem;
    this.seed          = seed; // active seed; readable by any system via ctx.seed
  }
}
