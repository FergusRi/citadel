export class HUD {
  constructor(gameState, buildingPlacer) {
    this._gs = gameState;
    this._bp = buildingPlacer;
    this._el = document.getElementById('ui-overlay');
    this._render();
    this._gs.on('resourceChange', () => this._updateResources());
    this._gs.on('phaseChange',    () => this._updatePhase());
    this._gs.on('hallDamage',     () => this._updateHallHP());
  }

  _render() {
    this._el.innerHTML = `
      <div id="hud-root">
        <div id="hud-top">
          <span id="hud-wood">🪵 <b id="v-wood">50</b></span>
          <span id="hud-stone">🪨 <b id="v-stone">0</b></span>
          <span id="hud-wave">Wave <b id="v-wave">0</b></span>
          <span id="hud-phase" id="v-phase">Planning</span>
        </div>
        <div id="hud-hall-bar-wrap">
          <div id="hud-hall-label">Town Hall</div>
          <div id="hud-hall-bar-bg"><div id="hud-hall-bar"></div></div>
        </div>
        <div id="hud-bottom">
          <button class="hud-btn" data-def="cannon_tower">Cannon Tower<br><small>20 🪵</small></button>
          <button class="hud-btn" data-def="archer_tower">Archer Tower<br><small>15 🪵</small></button>
          <button class="hud-btn" data-def="guard_post">Guard Post<br><small>10 🪵</small></button>
          <button class="hud-btn" data-def="lumberyard">Wood Camp<br><small>10 🪵</small></button>
          <button id="hud-wave-btn">▶ Send Wave<br><small>[Space]</small></button>
        </div>
        <div id="hud-hint">ESC = cancel placement</div>
        <div id="hud-gameover" style="display:none">
          <h2>⚔ Town Hall Destroyed</h2>
          <p>You survived <span id="go-waves"></span> waves.</p>
          <button onclick="location.reload()">Play Again</button>
        </div>
      </div>
    `;

    // Build buttons
    this._el.querySelectorAll('.hud-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._bp.startPlacement(btn.dataset.def);
      });
    });

    // Wave button
    document.getElementById('hud-wave-btn').addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });

    this._updateResources();
    this._updateHallHP();
    this._injectStyles();
  }

  _updateResources() {
    const r = this._gs.resources;
    const w = document.getElementById('v-wood');
    const s = document.getElementById('v-stone');
    const wv = document.getElementById('v-wave');
    if (w) w.textContent = r.wood  || 0;
    if (s) s.textContent = r.stone || 0;
    if (wv) wv.textContent = this._gs.wave;
  }

  _updatePhase() {
    const ph = document.getElementById('hud-phase');
    const wb = document.getElementById('hud-wave-btn');
    const wv = document.getElementById('v-wave');
    if (wv) wv.textContent = this._gs.wave;

    if (ph) {
      const labels = {
        planning: 'Planning', wave: '⚔ WAVE ACTIVE!',
        wave_end: 'Wave Over', game_over: '💀 DEFEAT',
      };
      ph.textContent = labels[this._gs.phase] || this._gs.phase;
      ph.className   = this._gs.phase === 'wave' ? 'phase-wave' : '';
    }
    if (wb) wb.disabled = this._gs.phase !== 'planning';

    if (this._gs.phase === 'game_over') {
      const go = document.getElementById('hud-gameover');
      const gw = document.getElementById('go-waves');
      if (go) go.style.display = 'flex';
      if (gw) gw.textContent   = this._gs.wave;
    }
  }

  _updateHallHP() {
    const bar = document.getElementById('hud-hall-bar');
    if (!bar) return;
    const pct = Math.max(0, this._gs.hallHP / this._gs.hallMaxHP * 100);
    bar.style.width = pct + '%';
    bar.style.background = pct > 50 ? '#44cc44' : pct > 25 ? '#ddaa00' : '#cc2200';
  }

  _injectStyles() {
    if (document.getElementById('hud-style')) return;
    const s = document.createElement('style');
    s.id = 'hud-style';
    s.textContent = `
      #hud-root {
        position: absolute; inset: 0; pointer-events: none;
        font-family: 'Segoe UI', sans-serif; font-size: 14px; color: #fff;
        display: flex; flex-direction: column; justify-content: space-between;
      }
      #hud-top {
        pointer-events: none;
        display: flex; gap: 18px; align-items: center;
        background: rgba(0,0,0,0.55); padding: 8px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      #hud-top span { font-size: 15px; }
      #hud-phase { margin-left: auto; font-weight: bold; letter-spacing: 1px; }
      #hud-phase.phase-wave { color: #ff6644; animation: pulse 0.8s infinite alternate; }
      @keyframes pulse { from { opacity:1 } to { opacity:0.5 } }

      #hud-hall-bar-wrap {
        pointer-events: none;
        position: absolute; top: 44px; left: 50%; transform: translateX(-50%);
        text-align: center; min-width: 220px;
      }
      #hud-hall-label { font-size: 11px; opacity: 0.7; margin-bottom: 2px; }
      #hud-hall-bar-bg {
        width: 220px; height: 10px; background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.2); border-radius: 5px; overflow: hidden;
      }
      #hud-hall-bar { height: 100%; transition: width 0.3s, background 0.3s; }

      #hud-bottom {
        pointer-events: all;
        display: flex; gap: 8px; justify-content: center; padding: 10px;
        background: rgba(0,0,0,0.6);
        border-top: 1px solid rgba(255,255,255,0.1);
      }
      .hud-btn, #hud-wave-btn {
        background: rgba(60,60,80,0.9); color: #fff; border: 1px solid rgba(255,255,255,0.25);
        border-radius: 6px; padding: 8px 14px; cursor: pointer;
        font-size: 13px; text-align: center; line-height: 1.4;
        transition: background 0.15s;
      }
      .hud-btn:hover { background: rgba(90,90,120,0.95); }
      .hud-btn:active { background: rgba(50,50,70,0.95); }
      #hud-wave-btn { background: rgba(60,100,60,0.9); }
      #hud-wave-btn:hover { background: rgba(80,130,80,0.95); }
      #hud-wave-btn:disabled { background: rgba(60,60,60,0.5); cursor: not-allowed; opacity: 0.5; }
      small { font-size: 11px; opacity: 0.75; }

      #hud-hint {
        pointer-events: none;
        position: absolute; bottom: 56px; left: 50%; transform: translateX(-50%);
        font-size: 11px; opacity: 0.45;
      }

      #hud-gameover {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0.75);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        pointer-events: all; text-align: center; gap: 12px;
      }
      #hud-gameover h2 { font-size: 32px; color: #ff4422; margin: 0; }
      #hud-gameover p  { font-size: 18px; margin: 0; }
      #hud-gameover button {
        padding: 10px 28px; font-size: 16px; border-radius: 6px;
        background: #cc3311; color: #fff; border: none; cursor: pointer;
      }
      #hud-gameover button:hover { background: #ee4422; }
    `;
    document.head.appendChild(s);
  }
}
