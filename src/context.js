export class Context {
  constructor({ renderer, camera, gameState, mapGen, settlement,
                citizenSystem, buildingPlacer, enemySystem, towerSystem, hud, seed }) {
    this.renderer       = renderer;
    this.camera         = camera;
    this.gameState      = gameState;
    this.mapGen         = mapGen;
    this.settlement     = settlement;
    this.citizenSystem  = citizenSystem;
    this.buildingPlacer = buildingPlacer;
    this.enemySystem    = enemySystem;
    this.towerSystem    = towerSystem;
    this.hud            = hud;
    this.seed           = seed;
  }
}
