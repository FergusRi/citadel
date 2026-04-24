export const Phase = {
  MENU: 'menu',
  PLANNING: 'planning',
  WARNING: 'warning',
  WAVE: 'wave',
  WAVE_END: 'wave_end',
};

export class GameState {
  constructor() {
    this.phase = Phase.MENU;
    this.wave = 0;
    this.resources = { wood: 30, stone: 0, food: 10 };
    this.population = { current: 0, max: 5 };
    this.buildings = [];
    this.enemies = [];
    this.citizens = [];
    this.towers = [];
    this._listeners = {};
  }

  setPhase(phase) {
    this.phase = phase;
    this._emit('phaseChange', phase);
  }

  addResource(type, amount) {
    this.resources[type] = (this.resources[type] || 0) + amount;
    this._emit('resourceChange', this.resources);
  }

  spendResource(type, amount) {
    if ((this.resources[type] || 0) < amount) return false;
    this.resources[type] -= amount;
    this._emit('resourceChange', this.resources);
    return true;
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
