import { Renderer }       from './systems/renderer.js';
import { CameraSystem }   from './systems/camera.js';
import { MapGenerator }   from './systems/mapGenerator.js';
import { GameState }      from './systems/gameState.js';
import { Context }        from './context.js';
import { Settlement }     from './systems/settlement.js';
import { CitizenSystem }  from './systems/citizens.js';
import { BuildingPlacer } from './systems/buildingPlacer.js';
import { EnemySystem }    from './systems/enemySystem.js';
import { TowerSystem }    from './systems/towerSystem.js';
import { HUD }            from './ui/hud.js';

const canvas  = document.getElementById('game-canvas');
const urlSeed = new URLSearchParams(window.location.search).get('seed');
const seed    = urlSeed !== null ? parseFloat(urlSeed) : Math.random() * 1_000_000;

const renderer  = new Renderer(canvas);
const gameState = new GameState();
const mapGen    = new MapGenerator(renderer.getScene(), seed);
const camera    = new CameraSystem(renderer.getCamera(), mapGen.bounds());

mapGen.generate();

const settlement = new Settlement(renderer.getScene(), gameState);
const hallPos    = mapGen.getSpawnPoint();
settlement.spawnHall(hallPos);

const citizenSystem = new CitizenSystem(renderer.getScene(), gameState);
citizenSystem.spawnStartingCitizens(hallPos);
citizenSystem.registerWoodNodes(mapGen.getResourceNodes());

const towerSystem = new TowerSystem(renderer.getScene(), gameState);

const buildingPlacer = new BuildingPlacer(
  renderer.getScene(), renderer.getCamera(), canvas,
  mapGen, gameState, citizenSystem, towerSystem,
);

const enemySystem = new EnemySystem(renderer.getScene(), gameState);
enemySystem.setHallPos(hallPos);

// Resume citizen gathering when wave ends
gameState.on('waveEnd', () => citizenSystem.resumeAfterWave());

gameState.setPhase('planning');
camera.setGameMode();

const hud = new HUD(gameState, buildingPlacer);

export const ctx = new Context({
  renderer, camera, gameState, mapGen, settlement,
  citizenSystem, buildingPlacer, enemySystem, towerSystem, hud, seed,
});

let lastTime = 0;
function loop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  camera.update(delta);
  citizenSystem.update(delta, gameState.phase);
  towerSystem.update(delta);
  enemySystem.update(delta);
  renderer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
