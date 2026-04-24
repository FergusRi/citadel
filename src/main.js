import { Renderer } from './systems/renderer.js';
import { CameraSystem } from './systems/camera.js';
import { MapGenerator } from './systems/mapGenerator.js';
import { GameState } from './systems/gameState.js';
import { Context } from './context.js';
import { Settlement } from './systems/settlement.js';
import { CitizenSystem } from './systems/citizens.js';

const canvas = document.getElementById('game-canvas');

// Read seed from URL param (?seed=1234) for reproducibility, else random.
const urlSeed = new URLSearchParams(window.location.search).get('seed');
const seed = urlSeed !== null ? parseFloat(urlSeed) : Math.random() * 1_000_000;

const renderer  = new Renderer(canvas);
const gameState = new GameState();
const mapGen    = new MapGenerator(renderer.getScene(), seed);
const camera    = new CameraSystem(renderer.getCamera(), mapGen.bounds());

mapGen.generate();

const settlement = new Settlement(renderer.getScene(), gameState);
settlement.spawnHall(mapGen.getSpawnPoint());

const citizenSystem = new CitizenSystem(renderer.getScene(), gameState);
citizenSystem.spawnStartingCitizens(mapGen.getSpawnPoint());

gameState.setPhase('planning');
camera.setGameMode();

export const ctx = new Context({ renderer, camera, gameState, mapGen, settlement, citizenSystem, seed });

let lastTime = 0;

function loop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  camera.update(delta);
  citizenSystem.update(delta, gameState.phase);
  renderer.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
