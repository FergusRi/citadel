export class Context {
  constructor({ renderer, camera, gameState, mapGen, settlement, seed }) {
    this.renderer   = renderer;
    this.camera     = camera;
    this.gameState  = gameState;
    this.mapGen     = mapGen;
    this.settlement = settlement;
    this.seed       = seed; // active seed; readable by any system via ctx.seed
  }
}
