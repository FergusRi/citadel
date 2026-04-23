import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const MENU_POS = new THREE.Vector3(0, 45, 40);
const MENU_TARGET = new THREE.Vector3(0, 0, 0);

const GAME_POS = new THREE.Vector3(0, 30, 28);
const GAME_TARGET = new THREE.Vector3(0, 0, 0);

const PAN_SPEED = 20;
const ZOOM_SPEED = 4;
const MIN_Y = 10;
const MAX_Y = 60;

export class CameraSystem {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.mode = 'menu';

    this.target = MENU_TARGET.clone();
    this._keys = {};
    this._transitioning = false;
    this._transitionProgress = 0;
    this._fromPos = new THREE.Vector3();
    this._toPos = new THREE.Vector3();
    this._fromTarget = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();

    this._bindInput();
  }

  _bindInput() {
    window.addEventListener('keydown', e => { this._keys[e.code] = true; });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });
    window.addEventListener('wheel', e => { this._onWheel(e); }, { passive: true });
  }

  _onWheel(e) {
    if (this.mode !== 'game') return;
    const delta = e.deltaY * 0.01;
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.target).normalize();
    this.camera.position.addScaledVector(dir, delta * ZOOM_SPEED);
    this.camera.position.y = Math.max(MIN_Y, Math.min(MAX_Y, this.camera.position.y));
  }

  setMenuMode() {
    this.mode = 'menu';
    this.camera.position.copy(MENU_POS);
    this.target.copy(MENU_TARGET);
    this.camera.lookAt(this.target);
  }

  setGameMode() {
    this.mode = 'transitioning';
    this._transitioning = true;
    this._transitionProgress = 0;
    this._fromPos.copy(this.camera.position);
    this._toPos.copy(GAME_POS);
    this._fromTarget.copy(this.target);
    this._toTarget.copy(GAME_TARGET);
  }

  update(delta) {
    if (this._transitioning) {
      this._transitionProgress = Math.min(1, this._transitionProgress + delta * 0.8);
      const t = this._ease(this._transitionProgress);
      this.camera.position.lerpVectors(this._fromPos, this._toPos, t);
      this.target.lerpVectors(this._fromTarget, this._toTarget, t);
      this.camera.lookAt(this.target);
      if (this._transitionProgress >= 1) {
        this._transitioning = false;
        this.mode = 'game';
      }
      return;
    }

    if (this.mode !== 'game') return;

    const moveDir = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();
    const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));

    if (this._keys['KeyW'] || this._keys['ArrowUp'])    moveDir.addScaledVector(camDir,  1);
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  moveDir.addScaledVector(camDir, -1);
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  moveDir.addScaledVector(right,  -1);
    if (this._keys['KeyD'] || this._keys['ArrowRight']) moveDir.addScaledVector(right,   1);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(PAN_SPEED * delta);
      this.camera.position.add(moveDir);
      this.target.add(moveDir);
    }

    this.camera.lookAt(this.target);
  }

  _ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
}