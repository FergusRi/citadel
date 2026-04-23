import { Renderer } from './systems/renderer.js';
import { CameraSystem } from './systems/camera.js';
import { MapGenerator } from './systems/mapGenerator.js';
import { GameState } from './systems/gameState.js';

const canvas = document.getElementById('game-canvas');

const renderer = new Renderer(canvas);
const camera = new CameraSystem(renderer.getCamera(), renderer.getDomElement());
const gameState = new GameState();
const mapGen = new MapGenerator(renderer.getScene());

mapGen.generate();
camera.setMenuMode();

let lastTime = 0;

function loop(timestamp) {
  const delta = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  camera.update(delta);
  renderer.render();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);