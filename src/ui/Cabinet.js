/**
 * Cabinet.js - Physical Pachinko Frame, 2D Ball Physics & Articulated Gimmick Orchestrator
 * for 'e けすじー' Smart Pachinko (スマパチ)
 *
 * Features:
 * - Authentic 'e けすじー' machine frame based on sozai/eけすじー筐体.jpg
 * - Real-time 60fps metallic pachinko ball physics (PlayfieldCanvas) with nails, windmills, stage, Heso, Denchu, and Attacker
 * - Articulated Cyborg Kesji & Top Logo mechanical gimmicks (可動役物) that drop over the LCD on climax moments
 * - Multi-stage Camera Zoom Controls ('full' | 'standard' | 'focus' | 'lcd_max') + Auto-Zoom on SP Reach
 */

import { Controls } from './Controls.js';
import { DataCounter } from './DataCounter.js';
import { CustomModal } from './CustomModal.js';
import { PlayfieldCanvas } from './PlayfieldCanvas.js';

export class Cabinet {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.initialBalls = options.initialBalls !== undefined ? options.initialBalls : 1500;
    this.balls = this.initialBalls;

    // Callbacks
    this._onFire = options.onFire || null;
    this._onButtonPress = options.onButtonPress || null;
    this._onLeverPull = options.onLeverPull || null;
    this._onConfigChange = options.onConfigChange || null;
    this._onSoundTest = options.onSoundTest || null;
    this._onHesoEnter = options.onHesoEnter || null;
    this._onDenchuEnter = options.onDenchuEnter || null;
    this._onAttackerEnter = options.onAttackerEnter || null;

    // Sub-components
    this.controls = null;
    this.dataCounter = null;
    this.customModal = null;
    this.playfield = null;

    // Lighting & Camera Zoom State
    this.currentLighting = 'idle';
    this.lightingTimer = null;

    // Camera view modes:
    // 'full' (1.0x hall view) | 'standard' (1.38x single machine) | 'focus' (1.95x playfield+LCD) | 'lcd_max' (2.85x LCD close-up)
    this.viewMode = 'standard';
    this.savedViewMode = 'standard';
    this.autoZoomOnReach = true;
    this.isZoomed = false;

    // DOM references
    this.dom = {
      root: null,
      topIsland: null,
      sirenLamp: null,
      sirenLampR: null,
      lcdContainer: null,
      lightGuide: null,
      vFlashCrystal: null,
      ballNumText: null,
      btnCustom: null,
      btnRefill: null,
      // Real Machine Elements
      machine: null,
      viewport: null,
      photoBg: null,
      embeddedBezel: null,
      realNeonAura: null,
      realCyborgGlow: null,
      realStrobeOverlay: null,
      realRainbowOverlay: null,
      photoPushBtn: null,
      viewModeButtons: [],
      btnQuickZoom: null,
      btnTriggerGimmick: null,
      btnAutoZoomToggle: null
    };

    this.render();
    this.initSubComponents();
    this.setViewMode('standard');
    this.startIdleLighting();
  }

  /**
   * Render cabinet HTML structure with authentic e-kesji machine frame, camera bar & physics mount
   */
  render() {
    const root = document.createElement('div');
    root.className = 'pachinko-cabinet';
    root.id = 'pachinko-cabinet';

    root.innerHTML = `
      <!-- 1. Top Island & Data Counter Unit -->
      <header class="cabinet-top-island">
        <div class="top-island-header">
          <div class="top-siren-tower">
            <div class="top-siren-lamp" id="top-siren-lamp"></div>
          </div>
          <div class="top-island-logo">e けすじー SMART PACHINKO</div>
          <div class="top-siren-tower">
            <div class="top-siren-lamp" id="top-siren-lamp-r"></div>
          </div>
        </div>
        <div id="cabinet-data-counter-mount" style="width: 100%;"></div>

        <!-- Camera & Gimmick Quick Control Bar (視点切替・液晶寄りバー) -->
        <div class="cabinet-camera-bar" id="cabinet-camera-bar">
          <div class="camera-bar-group">
            <span class="camera-bar-label">🎥 カメラ視点:</span>
            <button type="button" class="camera-mode-btn" data-view="full" title="両隣の台を含むホール全体表示">
              🏛️ ホール全景
            </button>
            <button type="button" class="camera-mode-btn active" data-view="standard" title="実機1台＋玉の流れ＋役物表示">
              🎰 実機標準
            </button>
            <button type="button" class="camera-mode-btn" data-view="focus" title="盤面・サイボーグ役物・液晶にグッと寄る">
              🎯 盤面＋液晶寄り
            </button>
            <button type="button" class="camera-mode-btn highlight-lcd-btn" data-view="lcd_max" title="液晶画面をドアップ拡大 (ショートカット: Zキー)">
              🔍 液晶ドアップ
            </button>
          </div>

          <div class="camera-bar-group">
            <button type="button" class="camera-action-btn active" id="btn-auto-zoom-toggle" title="リーチ・SP演出時に自動で液晶に寄る">
              🎬 リーチ自動寄り: ON
            </button>
            <button type="button" class="camera-action-btn gimmick-btn" id="btn-test-gimmick" title="サイボーグけすじー役物を強制可動させる">
              🤖 役物可動!
            </button>
          </div>
        </div>
      </header>

      <!-- 2. Main Frame Body: Authentic e-Kesji Cabinet, Physics Playfield & Embedded LCD -->
      <main class="cabinet-body cabinet-real-mode">
        <div class="cabinet-real-machine-viewport" id="cabinet-viewport">
          <div class="cabinet-real-machine view-standard" id="pachinko-real-machine">
            <!-- Authentic High-Resolution Machine Photo -->
            <img src="sozai/eけすじー筐体.jpg" class="cabinet-photo-bg" id="cabinet-photo-bg" alt="eけすじー実機筐体">

            <!-- Embedded LCD Slot (Exact Coordinates: 38.833% Left, 45.759% Top, 23.417% Width, 21.429% Height) -->
            <div class="cabinet-embedded-lcd-bezel" id="cabinet-embedded-bezel">
              <!-- LCD Mount Container (Host for ScreenDirector) -->
              <div class="cabinet-lcd-container" id="cabinet-lcd-stage">
                <!-- V-Flash Crystal Jewel Lamp -->
                <div class="cabinet-v-flash-crystal" id="v-flash-crystal" title="P-フラッシュ クリスタル"></div>

                <!-- Light Guide Acrylic Flash Overlay -->
                <div class="light-guide-overlay" id="cabinet-light-guide"></div>

                <!-- Screen director stage mounts here -->
              </div>

              <!-- LCD Surface Glare & Scanline Filter -->
              <div class="cabinet-lcd-glass-glare"></div>
            </div>

            <!-- Upper Neon Logo Glow Layer -->
            <div class="real-neon-aura" id="real-neon-aura"></div>

            <!-- Cyborg Kesji Mechanical Aura & Eye Glow Layer -->
            <div class="real-cyborg-glow" id="real-cyborg-glow"></div>

            <!-- Advance Strobe Red Flash Overlay (先バレ・激熱) -->
            <div class="real-strobe-overlay" id="real-strobe-overlay"></div>

            <!-- V-Flash Rainbow Burst Overlay -->
            <div class="real-rainbow-overlay" id="real-rainbow-overlay"></div>

            <!-- Physical Cabinet Push Button (Coordinates on image: ~64.2% Left, 83.2% Top) -->
            <div class="photo-interactive-push-btn" id="photo-push-btn" title="PUSHボタン (クリックまたはスペースキー)">
              <div class="photo-btn-inner-glow"></div>
            </div>
          </div>

          <!-- Floating One-Touch Zoom Button on Viewport Corner -->
          <div class="cabinet-floating-controls">
            <button class="cabinet-btn-zoom-Cycle" id="btn-toggle-zoom" type="button" title="クリックで液晶ドアップ ↔ 標準表示をワンタッチ切替 (Zキー)">
              <span id="zoom-icon">🔍</span>
              <span id="zoom-text">液晶に寄る (Z)</span>
            </button>
          </div>
        </div>
      </main>

      <!-- 3. Lower Apron & Ball Tray -->
      <footer class="cabinet-apron">
        <div class="apron-tray-row">
          <div class="ball-counter-display">
            <span class="ball-counter-label">持玉数:</span>
            <span class="ball-counter-num" id="cabinet-ball-count">${this.balls.toLocaleString()}</span>
            <span style="font-size: 11px; color: #838da1;">発</span>
          </div>

          <!-- Visual Shiny Balls in Tray -->
          <div class="tray-balls-visual">
            <div class="shiny-ball"></div>
            <div class="shiny-ball"></div>
            <div class="shiny-ball"></div>
            <div class="shiny-ball"></div>
            <div class="shiny-ball"></div>
          </div>

          <!-- Apron Actions -->
          <div class="apron-actions">
            <button class="cabinet-btn-utility" id="btn-open-custom" type="button" title="実機カスタマイズ">
              <span>⚙️ カスタム</span>
            </button>
            <button class="cabinet-btn-utility" id="btn-refill-balls" type="button" title="玉補充 (+1000発)">
              <span>➕ 玉補充</span>
            </button>
          </div>
        </div>

        <!-- 4. Controls Console Mount -->
        <div id="cabinet-controls-mount" style="width: 100%;"></div>
      </footer>
    `;

    this.dom.root = root;
    this.dom.topIsland = root.querySelector('.cabinet-top-island');
    this.dom.sirenLamp = root.querySelector('#top-siren-lamp');
    this.dom.sirenLampR = root.querySelector('#top-siren-lamp-r');
    this.dom.lcdContainer = root.querySelector('#cabinet-lcd-stage');
    this.dom.lightGuide = root.querySelector('#cabinet-light-guide');
    this.dom.vFlashCrystal = root.querySelector('#v-flash-crystal');
    this.dom.ballNumText = root.querySelector('#cabinet-ball-count');
    this.dom.btnCustom = root.querySelector('#btn-open-custom');
    this.dom.btnRefill = root.querySelector('#btn-refill-balls');

    // Real machine elements
    this.dom.machine = root.querySelector('#pachinko-real-machine');
    this.dom.viewport = root.querySelector('#cabinet-viewport');
    this.dom.photoBg = root.querySelector('#cabinet-photo-bg');
    this.dom.embeddedBezel = root.querySelector('#cabinet-embedded-bezel');
    this.dom.realNeonAura = root.querySelector('#real-neon-aura');
    this.dom.realCyborgGlow = root.querySelector('#real-cyborg-glow');
    this.dom.realStrobeOverlay = root.querySelector('#real-strobe-overlay');
    this.dom.realRainbowOverlay = root.querySelector('#real-rainbow-overlay');
    this.dom.photoPushBtn = root.querySelector('#photo-push-btn');
    this.dom.btnQuickZoom = root.querySelector('#btn-toggle-zoom');
    this.dom.zoomIcon = root.querySelector('#zoom-icon');
    this.dom.zoomText = root.querySelector('#zoom-text');
    this.dom.viewModeButtons = Array.from(root.querySelectorAll('.camera-mode-btn'));
    this.dom.btnAutoZoomToggle = root.querySelector('#btn-auto-zoom-toggle');
    this.dom.btnTriggerGimmick = root.querySelector('#btn-test-gimmick');

    // Bind camera mode buttons
    this.dom.viewModeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-view');
        this.setViewMode(mode, true);
      });
    });

    // Bind quick zoom toggle button
    if (this.dom.btnQuickZoom) {
      this.dom.btnQuickZoom.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleZoom();
      });
    }

    // Bind auto-zoom toggle button
    if (this.dom.btnAutoZoomToggle) {
      this.dom.btnAutoZoomToggle.addEventListener('click', () => {
        this.autoZoomOnReach = !this.autoZoomOnReach;
        this.dom.btnAutoZoomToggle.classList.toggle('active', this.autoZoomOnReach);
        this.dom.btnAutoZoomToggle.textContent = this.autoZoomOnReach
          ? '🎬 リーチ自動寄り: ON'
          : '🎬 リーチ自動寄り: OFF';
      });
    }

    // Bind manual gimmick test button
    if (this.dom.btnTriggerGimmick) {
      this.dom.btnTriggerGimmick.addEventListener('click', () => {
        this.triggerGimmick('climax_drop', 3200);
        this.rumbleCabinet(1200, 'heavy');
        this.flashIllumination('red', 3, 150);
      });
    }

    // Bind Keyboard 'Z' shortcut for quick zoom to LCD
    window.addEventListener('keydown', (e) => {
      if (e.key === 'z' || e.key === 'Z') {
        if (document.activeElement?.tagName !== 'INPUT') {
          this.toggleZoom();
        }
      }
    });

    // Bind real machine interactive push button
    if (this.dom.photoPushBtn) {
      this.dom.photoPushBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dom.photoPushBtn.classList.add('pressed');
        setTimeout(() => this.dom.photoPushBtn.classList.remove('pressed'), 200);
        if (this.controls) {
          this.controls.triggerButtonPress();
        } else if (this._onButtonPress) {
          this._onButtonPress({ timestamp: Date.now(), device: 'photo-button' });
        }
      });
    }

    // Double-click machine to toggle zoom
    if (this.dom.machine) {
      this.dom.machine.addEventListener('dblclick', (e) => {
        if (!e.target.closest('#photo-push-btn')) {
          this.toggleZoom();
        }
      });
    }

    // Crystal click test
    this.dom.vFlashCrystal?.addEventListener('click', () => {
      this.triggerVFlash();
    });

    // Refill button
    this.dom.btnRefill?.addEventListener('click', () => {
      this.addBalls(1000);
    });

    this.container.appendChild(root);
  }

  /**
   * Set camera view mode:
   * - 'full'     : 1.0x Hall view
   * - 'standard' : 1.38x Single machine view (cuts out neighboring machines, clear balls & gimmick)
   * - 'focus'    : 1.95x Playfield + Cyborg + LCD close-up
   * - 'lcd_max'  : 2.85x Ultra LCD close-up
   */
  setViewMode(mode = 'standard', isManual = false) {
    this.viewMode = mode;
    if (isManual) {
      this.savedViewMode = mode;
    }
    this.isZoomed = (mode === 'focus' || mode === 'lcd_max');

    if (this.dom.machine) {
      this.dom.machine.classList.remove('view-full', 'view-standard', 'view-focus', 'view-lcd_max', 'zoomed-in');
      this.dom.machine.classList.add(`view-${mode}`);
      if (this.isZoomed) {
        this.dom.machine.classList.add('zoomed-in');
      }
    }

    // Update camera bar active buttons
    this.dom.viewModeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
    });

    // Update floating button label
    if (this.dom.zoomIcon && this.dom.zoomText) {
      if (mode === 'lcd_max') {
        this.dom.zoomIcon.textContent = '🎰';
        this.dom.zoomText.textContent = '全体に戻る (Z)';
      } else if (mode === 'focus') {
        this.dom.zoomIcon.textContent = '🔍';
        this.dom.zoomText.textContent = 'さらに液晶拡大 (Z)';
      } else {
        this.dom.zoomIcon.textContent = '🔍';
        this.dom.zoomText.textContent = '液晶に寄る (Z)';
      }
    }
  }

  /**
   * Cycle / Toggle zoom quickly for the user
   */
  toggleZoom() {
    if (this.viewMode === 'standard' || this.viewMode === 'full') {
      this.setViewMode('focus', true);
    } else if (this.viewMode === 'focus') {
      this.setViewMode('lcd_max', true);
    } else {
      this.setViewMode('standard', true);
    }
  }

  /**
   * Auto-zoom into LCD during exciting reach sequences, and restore afterward
   */
  notifyReachStart(isClimax = false) {
    if (!this.autoZoomOnReach) return;
    if (this.viewMode === 'full' || this.viewMode === 'standard') {
      this.setViewMode(isClimax ? 'lcd_max' : 'focus', false);
    } else if (this.viewMode === 'focus' && isClimax) {
      this.setViewMode('lcd_max', false);
    }
  }

  notifyReachEnd() {
    if (!this.autoZoomOnReach) return;
    if (this.viewMode !== this.savedViewMode) {
      this.setViewMode(this.savedViewMode, false);
    }
  }

  /**
   * Trigger mechanical Cyborg Kesji & Logo Gimmick movement
   * @param {'idle'|'sakiyomi'|'pseudo2'|'pseudo3'|'climax_drop'|'fever'} state
   * @param {number} durationMs
   */
  triggerGimmick(state = 'climax_drop', durationMs = 3500) {
    this.playfield?.triggerGimmick(state, durationMs);
  }

  /**
   * Launch a physical silver ball onto the playfield canvas
   */
  launchBallToPlayfield(power = 55) {
    this.playfield?.launchBall(power);
  }

  /**
   * Update playfield gate states (NORMAL, RUSH_LOW, RUSH_HIGH_LT, BONUS)
   */
  setPlayfieldMode(mode) {
    this.playfield?.setGameMode(mode);
  }

  /**
   * Instantiate and mount DataCounter, PlayfieldCanvas, Controls, and CustomModal
   */
  initSubComponents() {
    // 1. Data Counter
    const dcMount = this.dom.root.querySelector('#cabinet-data-counter-mount');
    this.dataCounter = new DataCounter({
      container: dcMount
    });

    // 2. Playfield 2D Ball Physics & Articulated Gimmicks Canvas
    this.playfield = new PlayfieldCanvas({
      container: this.dom.machine,
      imageSrc: 'sozai/eけすじー筐体.jpg',
      onHesoEnter: () => {
        if (this._onHesoEnter) this._onHesoEnter();
      },
      onDenchuEnter: () => {
        if (this._onDenchuEnter) this._onDenchuEnter();
      },
      onAttackerEnter: () => {
        if (this._onAttackerEnter) this._onAttackerEnter();
      }
    });

    // 3. Custom Settings Modal
    this.customModal = new CustomModal({
      onConfigChange: (config) => {
        if (this._onConfigChange) this._onConfigChange(config);
      },
      onSoundTest: (type) => {
        if (this._onSoundTest) {
          this._onSoundTest(type);
        } else {
          this.flashIllumination(type === 'red' ? 'red' : (type === 'rainbow' ? 'rainbow' : 'white'), 2, 100);
        }
      }
    });

    // Open custom modal button
    this.dom.btnCustom?.addEventListener('click', () => {
      this.customModal.open();
    });

    // 4. Controls Station
    const controlsMount = this.dom.root.querySelector('#cabinet-controls-mount');
    this.controls = new Controls({
      container: controlsMount,
      onFire: (data) => {
        if (this.balls > 0) {
          this.consumeBalls(1);
          this.dataCounter.recordSpin(1);
          this.launchBallToPlayfield(data?.power || 55);
        }
        if (this._onFire) this._onFire(data);
      },
      onButtonPress: (data) => {
        if (this._onButtonPress) this._onButtonPress(data);
      },
      onLeverPull: (data) => {
        if (this._onLeverPull) this._onLeverPull(data);
      }
    });
  }

  /**
   * Set physical machine lighting pattern & atmospheric neon aura
   * @param {string} pattern - 'idle' | 'rainbow' | 'red-flash' | 'gold-radiance' | 'v-flash' | 'warning' | 'off'
   * @param {number} duration - ms
   */
  setLightingPattern(pattern = 'idle', duration = 0) {
    if (this.lightingTimer) {
      clearTimeout(this.lightingTimer);
      this.lightingTimer = null;
    }

    this.currentLighting = pattern;

    // Reset base classes
    this.dom.sirenLamp?.classList.remove('active');
    this.dom.sirenLampR?.classList.remove('active');
    this.dom.realNeonAura?.setAttribute('class', 'real-neon-aura');
    this.dom.realCyborgGlow?.setAttribute('class', 'real-cyborg-glow');

    switch (pattern) {
      case 'rainbow':
        this.dom.sirenLamp?.classList.add('active');
        this.dom.sirenLampR?.classList.add('active');
        this.dom.realNeonAura?.classList.add('active-rainbow');
        this.dom.realCyborgGlow?.classList.add('active-rainbow');
        this.triggerGimmick('fever', duration || 5000);
        break;

      case 'red-flash':
      case 'warning':
        this.dom.sirenLamp?.classList.add('active');
        this.dom.sirenLampR?.classList.add('active');
        this.dom.realNeonAura?.classList.add('active-red');
        this.dom.realCyborgGlow?.classList.add('active-red');
        break;

      case 'gold-radiance':
        this.dom.realNeonAura?.classList.add('active-gold');
        this.dom.realCyborgGlow?.classList.add('active-gold');
        break;

      case 'v-flash':
        this.dom.sirenLamp?.classList.add('active');
        this.dom.sirenLampR?.classList.add('active');
        this.triggerVFlash();
        break;

      case 'off':
        break;

      case 'idle':
      default:
        this.startIdleLighting();
        return;
    }

    if (duration > 0) {
      this.lightingTimer = setTimeout(() => {
        this.setLightingPattern('idle');
      }, duration);
    }
  }

  /**
   * Gentle idle breathing lighting pattern for cabinet
   */
  startIdleLighting() {
    this.dom.sirenLamp?.classList.remove('active');
    this.dom.sirenLampR?.classList.remove('active');
    this.dom.realNeonAura?.setAttribute('class', 'real-neon-aura active-idle');
    this.dom.realCyborgGlow?.setAttribute('class', 'real-cyborg-glow active-idle');
  }

  /**
   * Quick illumination flash (Kesu-bare, chance-up, or reel stop)
   * @param {string} color - 'white' | 'red' | 'gold' | 'rainbow'
   * @param {number} times
   * @param {number} speed
   */
  flashIllumination(color = 'white', times = 1, speed = 200) {
    const guide = this.dom.lightGuide;
    if (guide) {
      guide.className = 'light-guide-overlay';
      void guide.offsetWidth; // force reflow
      const colorClass = `light-guide-${color}`;
      guide.classList.add(colorClass);
      setTimeout(() => guide.classList.remove(colorClass), speed * times);
    }

    // Flash physical machine strobe
    if (color === 'red') {
      const strobe = this.dom.realStrobeOverlay;
      if (strobe) {
        strobe.classList.add('active');
        setTimeout(() => strobe.classList.remove('active'), speed * times);
      }
    } else if (color === 'gold' || color === 'rainbow') {
      const burst = this.dom.realRainbowOverlay;
      if (burst) {
        burst.classList.add('active');
        setTimeout(() => burst.classList.remove('active'), speed * times);
      }
    }

    // Pulse photo button
    if (this.dom.photoPushBtn) {
      this.dom.photoPushBtn.classList.add('pulse');
      setTimeout(() => this.dom.photoPushBtn?.classList.remove('pulse'), speed * times);
    }
  }

  /**
   * Trigger V-Flash (P-フラッシュ一発告知 & レインボースパーク + 役物落下)
   */
  triggerVFlash(duration = 2500) {
    const crystal = this.dom.vFlashCrystal;
    if (crystal) {
      crystal.classList.add('active');
    }

    if (this.dom.realRainbowOverlay) {
      this.dom.realRainbowOverlay.classList.add('active');
    }
    if (this.dom.realNeonAura) {
      this.dom.realNeonAura.classList.add('active-rainbow');
    }

    this.triggerGimmick('climax_drop', duration);
    this.flashIllumination('rainbow', 1, duration);

    setTimeout(() => {
      if (crystal) crystal.classList.remove('active');
      if (this.dom.realRainbowOverlay) this.dom.realRainbowOverlay.classList.remove('active');
    }, duration);
  }

  /**
   * Trigger P-Blow Air Gust
   */
  triggerAirBlow(duration = 1800) {
    const airContainer = document.createElement('div');
    airContainer.className = 'air-blow-active';

    for (let i = 0; i < 7; i++) {
      const p = document.createElement('div');
      p.className = 'air-blow-particle';
      p.style.left = `${45 + (i - 3) * 6}%`;
      p.style.animationDelay = `${i * 0.08}s`;
      airContainer.appendChild(p);
    }

    this.dom.root.querySelector('.controls-left-station')?.appendChild(airContainer);

    setTimeout(() => {
      airContainer.remove();
    }, duration);
  }

  /**
   * Rumble entire physical cabinet (レバブル & 実機激震)
   */
  rumbleCabinet(duration = 1500, intensity = 'light') {
    if (this.dom.viewport) {
      this.dom.viewport.classList.add('cabinet-shake');
      setTimeout(() => {
        this.dom.viewport?.classList.remove('cabinet-shake');
      }, duration);
    }

    this.controls?.startRevaburu(duration, 'all', intensity);
  }

  /**
   * Ball counter manipulation
   */
  setBallCount(count) {
    this.balls = Math.max(0, count);
    if (this.dom.ballNumText) {
      this.dom.ballNumText.textContent = this.balls.toLocaleString();
    }
  }

  updateBallDisplay() {
    this.setBallCount(this.balls);
  }

  addBalls(count) {
    this.setBallCount(this.balls + count);
  }

  consumeBalls(count = 1) {
    this.setBallCount(this.balls - count);
  }

  // Getters for child containers
  get lcdContainer() {
    return this.dom.lcdContainer;
  }

  // Event subscription helpers
  onFire(cb) { this._onFire = cb; }
  onButtonPress(cb) { this._onButtonPress = cb; }
  onLeverPull(cb) { this._onLeverPull = cb; }
  onConfigChange(cb) { this._onConfigChange = cb; }
  onSoundTest(cb) { this._onSoundTest = cb; }
  onHesoEnter(cb) { this._onHesoEnter = cb; }
  onDenchuEnter(cb) { this._onDenchuEnter = cb; }
  onAttackerEnter(cb) { this._onAttackerEnter = cb; }
}

export default Cabinet;
