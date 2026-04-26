export const Phase = {
  MENU:     'menu',
  PLANNING: 'planning',
  WARNING:  'warning',
  WAVE:     'wave',
  WAVE_END: 'wave_end',
};

export class GameState {
  constructor() {
    this.phase    = Phase.MENU;
    this.wave     = 0;
    this.resources = { wood: 50, stone: 0, food: 10 };
    this.population = { current: 0, max: 5 };
    this.buildings  = [];
    this.enemies    = [];
    this.citizens   = [];
    this.towers     = [];
    this.guardPosts = [];
    this.hallHP     = 500;
    this.hallMaxHP  = 500;
    this.gameOver   = false;
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

  damageHall(amount) {
    if (this.gameOver) return;
    this.hallHP = Math.max(0, this.hallHP - amount);
    this._emit('hallDamage', this.hallHP);
    if (this.hallHP <= 0) {
      this.gameOver = true;
      this.setPhase('game_over');
    }
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }
}
