/**
 * Controls.js - Rotary Handle, Push Button, and Pop-up Lever Controller
 * for 'e けすじー' Pachinko Cabinet
 */

export class Controls {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onFire = options.onFire || null;
    this.onButtonPress = options.onButtonPress || null;
    this.onLeverPull = options.onLeverPull || null;
    this.onPowerChange = options.onPowerChange || null;
    this.onAutoFireChange = options.onAutoFireChange || null;

    // Handle State
    this.power = 55;             // 0% - 100% (default 55% target sweet-spot)
    this.isFiring = false;       // Currently firing?
    this.isAutoFire = false;     // Auto-fire mode enabled?
    this.fireTimer = null;
    this.fireInterval = 600;     // 100 balls / min (pachinko standard ~600ms)
    this.isDraggingHandle = false;

    // Prompt & Action States
    this.promptState = 'idle';   // 'idle' | 'normal' | 'deka' | 'rainbow' | 'lever'
    this.promptTimeout = null;
    this.promptOnTrigger = null;
    this.isLeverPopped = false;
    this.isRumbling = false;
    this.rumbleTimeout = null;

    // DOM Element references
    this.dom = {
      root: null,
      handleWrapper: null,
      handleWheel: null,
      handleCapText: null,
      powerMeterFill: null,
      zoneLabel: null,
      btnAutoFire: null,
      buttonStation: null,
      buttonWell: null,
      pushButton: null,
      leverStation: null,
      leverGrip: null,
      airVent: null
    };

    if (this.container) {
      this.mount(this.container);
    }

    this.bindKeyboard();
  }

  /**
   * Mount controls station into cabinet console container
   */
  mount(container) {
    this.container = container;
    this.render();
    this.bindHandleEvents();
    this.bindButtonEvents();
    this.bindLeverEvents();
    this.updatePowerUI();
  }

  render() {
    const root = document.createElement('div');
    root.className = 'cabinet-controls-console';
    root.innerHTML = `
      <!-- Left Station: P-Blow, Push Button & Pop-Up Lever -->
      <div class="controls-left-station">
        <!-- P-Blow Vent -->
        <div class="air-blow-vent" title="P-Blow (風体感ノズル)">
          <div class="vent-grille">
            <div class="vent-slit"></div>
            <div class="vent-slit"></div>
            <div class="vent-slit"></div>
          </div>
          <span class="vent-label">P-BLOW</span>
        </div>

        <!-- Push Button Station -->
        <div class="pachinko-button-station">
          <div class="pachinko-button-well" id="cabinet-push-well">
            <button class="pachinko-push-button" id="cabinet-push-btn" type="button">
              <span>PUSH</span>
            </button>
          </div>
          <span class="button-hint-key">[Space / Click]</span>
        </div>

        <!-- Pop-Up Lever Station (激震レバー) -->
        <div class="pachinko-lever-station">
          <div class="lever-housing-base">
            <div class="lever-handle-grip" id="cabinet-lever-grip" title="激震レバー (引く/押す)">
              <div class="lever-grip-texture"></div>
              <div class="lever-grip-texture"></div>
              <span class="lever-label">PULL</span>
            </div>
          </div>
          <span class="button-hint-key">[↓ / Click]</span>
        </div>
      </div>

      <!-- Right Station: Power Gauge & Rotary Handle -->
      <div class="controls-right-station">
        <!-- Power Gauge -->
        <div class="handle-gauge-wrap">
          <div class="handle-power-meter" id="handle-power-gauge" title="クリックで強さ調整">
            <div class="power-meter-fill" id="power-meter-fill"></div>
          </div>
          <span class="gauge-zone-label" id="gauge-zone-label">ぶっこみ</span>
        </div>

        <!-- Rotary Handle Disc -->
        <div class="rotary-handle-wrapper" id="rotary-handle-wrapper" title="ドラッグで回転調整 / 長押しで発射">
          <div class="rotary-handle-wheel" id="rotary-handle-wheel">
            <div class="rotary-handle-grip-knob"></div>
            <div class="rotary-handle-cap">
              <span class="rotary-cap-text">FIRE</span>
              <span class="rotary-power-text" id="rotary-power-text">55%</span>
            </div>
          </div>
        </div>

        <!-- Auto Fire Toggle Switch -->
        <div class="auto-fire-control">
          <button class="btn-auto-fire" id="btn-auto-fire" type="button" title="オート連射 [Aキー]">
            AUTO<br>打ち
          </button>
        </div>
      </div>
    `;

    this.dom.root = root;
    this.dom.handleWrapper = root.querySelector('#rotary-handle-wrapper');
    this.dom.handleWheel = root.querySelector('#rotary-handle-wheel');
    this.dom.powerMeterFill = root.querySelector('#power-meter-fill');
    this.dom.zoneLabel = root.querySelector('#gauge-zone-label');
    this.dom.powerText = root.querySelector('#rotary-power-text');
    this.dom.btnAutoFire = root.querySelector('#btn-auto-fire');

    this.dom.buttonStation = root.querySelector('.pachinko-button-station');
    this.dom.buttonWell = root.querySelector('#cabinet-push-well');
    this.dom.pushButton = root.querySelector('#cabinet-push-btn');

    this.dom.leverStation = root.querySelector('.pachinko-lever-station');
    this.dom.leverGrip = root.querySelector('#cabinet-lever-grip');
    this.dom.airVent = root.querySelector('.air-blow-vent');

    this.container.appendChild(root);
  }

  /**
   * Bind rotary handle drag and touch interactions
   */
  bindHandleEvents() {
    const handle = this.dom.handleWrapper;
    const gauge = this.dom.root.querySelector('#handle-power-gauge');
    const autoBtn = this.dom.btnAutoFire;

    // Direct click/drag on power gauge
    const setFromGaugeEvent = (e) => {
      const rect = gauge.getBoundingClientRect();
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const offsetY = rect.bottom - clientY;
      const percent = Math.min(100, Math.max(0, Math.round((offsetY / rect.height) * 100)));
      this.setPower(percent);
    };

    gauge.addEventListener('mousedown', (e) => {
      setFromGaugeEvent(e);
      const onMove = (me) => setFromGaugeEvent(me);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Rotary Handle drag rotation
    let startAngle = 0;
    let initialPower = 0;

    const getAngleFromCenter = (e) => {
      const rect = handle.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
    };

    const onPointerDown = (e) => {
      this.isDraggingHandle = true;
      startAngle = getAngleFromCenter(e);
      initialPower = this.power;

      // Also start firing on press if not already in auto
      if (!this.isAutoFire) {
        this.startFiring();
      }

      const onPointerMove = (me) => {
        if (!this.isDraggingHandle) return;
        const currentAngle = getAngleFromCenter(me);
        let delta = currentAngle - startAngle;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        // Scale angle delta to power delta
        const powerDelta = Math.round(delta * 0.8);
        const newPower = Math.min(100, Math.max(0, initialPower + powerDelta));
        this.setPower(newPower);
      };

      const onPointerUp = () => {
        this.isDraggingHandle = false;
        if (!this.isAutoFire) {
          this.stopFiring();
        }
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerUp);
      };

      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
    };

    handle.addEventListener('mousedown', onPointerDown);
    handle.addEventListener('touchstart', onPointerDown, { passive: false });

    // Wheel scroll on handle to adjust power
    handle.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 5 : -5;
      this.setPower(this.power + delta);
    }, { passive: false });

    // Auto-fire button toggle
    autoBtn.addEventListener('click', () => {
      this.toggleAutoFire();
    });
  }

  /**
   * Bind Push Button click events
   */
  bindButtonEvents() {
    const btn = this.dom.pushButton;
    const well = this.dom.buttonWell;

    const handlePress = (e) => {
      e.preventDefault();
      this.triggerButton();
    };

    btn.addEventListener('click', handlePress);
    well.addEventListener('click', handlePress);
  }

  /**
   * Bind Pop-up Lever click/pull events
   */
  bindLeverEvents() {
    const lever = this.dom.leverGrip;
    lever.addEventListener('click', (e) => {
      e.preventDefault();
      this.triggerLever();
    });
  }

  /**
   * Global Keyboard Shortcuts (Space, Enter, Arrow keys, KeyA)
   */
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing inside an input/textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (this.isLeverPopped) {
          this.triggerLever();
        } else {
          this.triggerButton();
        }
      } else if (e.code === 'ArrowDown') {
        if (this.isLeverPopped) {
          e.preventDefault();
          this.triggerLever();
        }
      } else if (e.code === 'KeyA') {
        this.toggleAutoFire();
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        this.setPower(this.power + 5);
      } else if (e.code === 'ArrowLeft') {
        this.setPower(this.power - 5);
      }
    });
  }

  /**
   * Set firing power (0 to 100)
   */
  setPower(val) {
    this.power = Math.min(100, Math.max(0, val));
    this.updatePowerUI();
    if (this.onPowerChange) {
      this.onPowerChange(this.power, this.isRightSide());
    }
  }

  getPower() {
    return this.power;
  }

  isRightSide() {
    return this.power > 75;
  }

  /**
   * Update visual handle rotation, power gauge, and zone labels
   */
  updatePowerUI() {
    if (!this.dom.root) return;

    // Update gauge fill height
    this.dom.powerMeterFill.style.height = `${this.power}%`;
    this.dom.powerText.textContent = `${this.power}%`;

    // Rotate handle wheel: 0% -> 0deg, 100% -> 110deg
    const angle = (this.power / 100) * 110;
    this.dom.handleWheel.style.transform = `rotate(${angle}deg)`;

    // Zone labels
    let label = 'ぶっこみ';
    if (this.power === 0) {
      label = '停止';
    } else if (this.power < 30) {
      label = '弱め';
    } else if (this.power <= 75) {
      label = 'ぶっこみ';
    } else {
      label = '右打ち!';
    }
    this.dom.zoneLabel.textContent = label;

    if (this.power > 75) {
      this.dom.zoneLabel.classList.add('active-zone');
      this.dom.zoneLabel.style.color = '#ff1744';
      if (this.isFiring) {
        this.dom.handleWheel.classList.add('firing-overdrive');
        this.dom.handleWheel.classList.remove('firing');
      }
    } else {
      this.dom.zoneLabel.classList.remove('active-zone');
      this.dom.zoneLabel.style.color = '#7b8599';
      if (this.isFiring) {
        this.dom.handleWheel.classList.add('firing');
        this.dom.handleWheel.classList.remove('firing-overdrive');
      }
    }
  }

  /**
   * Start shooting balls continuously at ~100 balls / min
   */
  startFiring() {
    if (this.isFiring) return;
    this.isFiring = true;

    if (this.power > 75) {
      this.dom.handleWheel.classList.add('firing-overdrive');
    } else {
      this.dom.handleWheel.classList.add('firing');
    }

    // Fire first ball immediately
    this.emitFireEvent();

    // Set firing interval (600ms = 100 balls/min)
    this.fireTimer = setInterval(() => {
      this.emitFireEvent();
    }, this.fireInterval);
  }

  stopFiring() {
    if (!this.isFiring) return;
    this.isFiring = false;
    if (this.fireTimer) {
      clearInterval(this.fireTimer);
      this.fireTimer = null;
    }
    if (this.dom.handleWheel) {
      this.dom.handleWheel.classList.remove('firing', 'firing-overdrive');
    }
  }

  /**
   * Toggle auto-fire state
   */
  toggleAutoFire(force) {
    const nextState = force !== undefined ? force : !this.isAutoFire;
    this.isAutoFire = nextState;

    if (this.dom.btnAutoFire) {
      if (this.isAutoFire) {
        this.dom.btnAutoFire.classList.add('active');
        this.startFiring();
      } else {
        this.dom.btnAutoFire.classList.remove('active');
        this.stopFiring();
      }
    }

    if (this.onAutoFireChange) {
      this.onAutoFireChange(this.isAutoFire);
    }
  }

  emitFireEvent() {
    if (this.power <= 0) return;
    if (this.onFire) {
      this.onFire({
        power: this.power,
        isRightSide: this.isRightSide(),
        timestamp: Date.now()
      });
    }
  }

  /**
   * Trigger Push Button action
   */
  triggerButton() {
    const btn = this.dom.pushButton;
    if (!btn) return;

    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 200);

    const promptType = this.promptState;
    if (this.promptOnTrigger) {
      const cb = this.promptOnTrigger;
      this.hidePrompt();
      cb({ type: promptType, control: 'button' });
    }

    if (this.onButtonPress) {
      this.onButtonPress({ type: promptType });
    }
  }

  /**
   * Trigger Lever pull action
   */
  triggerLever() {
    const lever = this.dom.leverGrip;
    if (!lever) return;

    lever.classList.add('lever-pulled');
    setTimeout(() => {
      lever.classList.remove('lever-pulled');
      if (this.isLeverPopped) {
        this.retractLever();
      }
    }, 350);

    const promptType = this.promptState;
    if (this.promptOnTrigger) {
      const cb = this.promptOnTrigger;
      this.hidePrompt();
      cb({ type: promptType, control: 'lever' });
    }

    if (this.onLeverPull) {
      this.onLeverPull({ type: promptType });
    }
  }

  /**
   * Pop up the 激震レバー with dramatic 3D animation
   */
  popOutLever() {
    if (this.isLeverPopped) return;
    this.isLeverPopped = true;
    if (this.dom.leverGrip) {
      this.dom.leverGrip.classList.add('lever-popped-up');
    }
  }

  /**
   * Retract the 激震レバー back to normal position
   */
  retractLever() {
    this.isLeverPopped = false;
    if (this.dom.leverGrip) {
      this.dom.leverGrip.classList.remove('lever-popped-up');
    }
  }

  /**
   * Show button / lever prompt on cabinet
   * @param {Object} opts - { type: 'normal'|'deka'|'rainbow'|'lever', duration: 5000, onTrigger, onTimeout }
   */
  showPrompt(opts = {}) {
    const { type = 'normal', duration = 5000, onTrigger = null, onTimeout = null } = opts;
    this.promptState = type;
    this.promptOnTrigger = onTrigger;

    const well = this.dom.buttonWell;
    if (!well) return;

    well.classList.remove('prompt-active', 'prompt-deka', 'prompt-rainbow');

    if (type === 'lever') {
      this.popOutLever();
    } else if (type === 'deka') {
      well.classList.add('prompt-active', 'prompt-deka');
    } else if (type === 'rainbow') {
      well.classList.add('prompt-active', 'prompt-rainbow');
    } else {
      well.classList.add('prompt-active');
    }

    if (this.promptTimeout) clearTimeout(this.promptTimeout);
    this.promptTimeout = setTimeout(() => {
      this.hidePrompt();
      if (onTimeout) onTimeout();
    }, duration);
  }

  /**
   * Hide button / lever prompt
   */
  hidePrompt() {
    this.promptState = 'idle';
    this.promptOnTrigger = null;
    if (this.promptTimeout) {
      clearTimeout(this.promptTimeout);
      this.promptTimeout = null;
    }

    if (this.dom.buttonWell) {
      this.dom.buttonWell.classList.remove('prompt-active', 'prompt-deka', 'prompt-rainbow');
    }

    if (this.isLeverPopped) {
      this.retractLever();
    }
  }

  /**
   * Start Rumble (レバブル / 激震 / 枠ブル)
   * @param {number} duration - ms
   * @param {string} target - 'lever' | 'handle' | 'cabinet' | 'all'
   * @param {string} intensity - 'light' | 'heavy'
   */
  startRevaburu(duration = 2000, target = 'all', intensity = 'light') {
    this.stopRevaburu();
    this.isRumbling = true;

    const shakeClass = intensity === 'heavy' ? 'rumble-heavy' : 'rumble-light';

    if (target === 'lever' || target === 'all') {
      this.dom.leverGrip?.classList.add('lever-rumble-active');
    }

    if (target === 'handle' || target === 'all') {
      this.dom.handleWrapper?.classList.add(shakeClass);
    }

    if (target === 'cabinet' || target === 'all') {
      const cabinet = document.querySelector('.pachinko-cabinet');
      cabinet?.classList.add(shakeClass);
    }

    this.rumbleTimeout = setTimeout(() => {
      this.stopRevaburu();
    }, duration);
  }

  stopRevaburu() {
    this.isRumbling = false;
    if (this.rumbleTimeout) {
      clearTimeout(this.rumbleTimeout);
      this.rumbleTimeout = null;
    }

    this.dom.leverGrip?.classList.remove('lever-rumble-active');
    this.dom.handleWrapper?.classList.remove('rumble-light', 'rumble-heavy');

    const cabinet = document.querySelector('.pachinko-cabinet');
    cabinet?.classList.remove('rumble-light', 'rumble-heavy');
  }
}
