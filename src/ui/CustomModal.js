/**
 * CustomModal.js - Pachinko Custom Settings Tablet Modal
 * for 'e けすじー'
 */

export class CustomModal {
  constructor(options = {}) {
    this.onConfigChange = options.onConfigChange || null;
    this.onSoundTest = options.onSoundTest || null;

    // Default configuration matching PachinkoEngine / CustomConfig specs
    this.config = {
      kesuBare: 'red',       // 'off' | 'white' | 'red' | 'rainbow'
      sakiyomi: 'chance',    // 'default' | 'chance' | 'netsu' | 'none'
      revaburu: 'on',        // 'off' | 'on'
      pFlash: 'on',          // 'off' | 'on'
      autoFire: 'auto',      // 'manual' | 'auto' | 'smart'
      screenShake: true,     // true | false
      volume: {
        master: 80,
        bgm: 70,
        se: 85,
        voice: 90
      }
    };

    // Load persisted settings
    this.loadFromStorage();

    // DOM References
    this.dom = {
      overlay: null,
      card: null
    };

    this.render();
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('kesu_pachinko_custom_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
      }
    } catch (e) {
      console.warn('LocalStorage not available, using default config');
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem('kesu_pachinko_custom_config', JSON.stringify(this.config));
    } catch (e) {
      // ignore
    }
  }

  render() {
    const overlay = document.createElement('div');
    overlay.className = 'cabinet-modal-overlay';
    overlay.id = 'cabinet-custom-modal';

    overlay.innerHTML = `
      <div class="cabinet-modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <span>実機カスタマイズ</span>
            <span class="modal-title-badge">CUSTOM SETTINGS</span>
          </div>
          <button class="modal-close-btn" type="button" aria-label="閉じる">&times;</button>
        </div>

        <div class="modal-body">
          <!-- 1. ケスバレ設定 -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">ケスバレ告知 (入賞時ポキューン♪)</div>
              <div class="config-desc">保留入賞時に激アツサウンドと枠告知が発生</div>
            </div>
            <div class="pill-options" data-group="kesuBare">
              <button class="pill-btn" data-value="off">OFF</button>
              <button class="pill-btn" data-value="white">白 (20%)</button>
              <button class="pill-btn active-red" data-value="red">赤 (40%)</button>
              <button class="pill-btn active-rainbow" data-value="rainbow">虹 (100%)</button>
            </div>
          </div>

          <!-- 2. 先読みチャンスモード -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">先読みカスタム</div>
              <div class="config-desc">保留変化や先読み演出の期待度</div>
            </div>
            <div class="pill-options" data-group="sakiyomi">
              <button class="pill-btn" data-value="default">標準</button>
              <button class="pill-btn active" data-value="chance">チャンス (70%)</button>
              <button class="pill-btn" data-value="netsu">熱 (95%)</button>
              <button class="pill-btn" data-value="none">なし</button>
            </div>
          </div>

          <!-- 3. レバブルアップ -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">レバブルアップ</div>
              <div class="config-desc">レバー激震の出現率大幅UP＆大当り占有率90%超</div>
            </div>
            <div class="pill-options" data-group="revaburu">
              <button class="pill-btn" data-value="off">OFF</button>
              <button class="pill-btn active-red" data-value="on">ON (大好物)</button>
            </div>
          </div>

          <!-- 4. P-フラッシュ告知アップ -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">P-フラッシュ告知アップ</div>
              <div class="config-desc">キュインキュイン！の一発告知発生率大幅UP</div>
            </div>
            <div class="pill-options" data-group="pFlash">
              <button class="pill-btn" data-value="off">OFF</button>
              <button class="pill-btn active-rainbow" data-value="on">ON (激アツ)</button>
            </div>
          </div>

          <!-- 5. オートハンドル / 発射設定 -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">発射モード (ハンドル)</div>
              <div class="config-desc">保留満タン自動止め / フルオート打ち</div>
            </div>
            <div class="pill-options" data-group="autoFire">
              <button class="pill-btn" data-value="manual">手動</button>
              <button class="pill-btn active" data-value="auto">自動</button>
              <button class="pill-btn" data-value="smart">スマート(保4止)</button>
            </div>
          </div>

          <!-- 6. サウンド音量設定 -->
          <div class="config-group">
            <div class="config-info">
              <div class="config-name">マスター音量</div>
              <div class="config-desc">全体サウンドレベル</div>
            </div>
            <div class="slider-group">
              <input type="range" class="volume-slider" data-volume="master" min="0" max="100" value="${this.config.volume.master}">
              <span class="slider-val" data-val-for="master">${this.config.volume.master}%</span>
            </div>
          </div>

          <div class="config-group">
            <div class="config-info">
              <div class="config-name">BGM / 効果音 (SE)</div>
              <div class="config-desc">演出BGMとポキューン/当り音のバランス</div>
            </div>
            <div class="slider-group">
              <input type="range" class="volume-slider" data-volume="se" min="0" max="100" value="${this.config.volume.se}">
              <span class="slider-val" data-val-for="se">${this.config.volume.se}%</span>
            </div>
          </div>

          <!-- 7. ケスバレ試聴ボタン -->
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
            <button class="cabinet-btn-utility btn-test-kesubare" type="button">
              <span>🔊 ケスバレ音テスト (ポキューン！)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    // Setup event listeners
    const closeBtn = overlay.querySelector('.modal-close-btn');
    closeBtn.addEventListener('click', () => this.close());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Pill click handling
    const pillGroups = overlay.querySelectorAll('.pill-options');
    pillGroups.forEach((group) => {
      const groupKey = group.dataset.group;
      const btns = group.querySelectorAll('.pill-btn');
      btns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.value;
          this.setValue(groupKey, val);
        });
      });
    });

    // Volume sliders
    const sliders = overlay.querySelectorAll('.volume-slider');
    sliders.forEach((slider) => {
      slider.addEventListener('input', (e) => {
        const type = slider.dataset.volume;
        const val = parseInt(e.target.value, 10);
        this.config.volume[type] = val;
        const valLabel = overlay.querySelector(`[data-val-for="${type}"]`);
        if (valLabel) valLabel.textContent = `${val}%`;
        this.emitChange();
      });
    });

    // Sound test button
    const testBtn = overlay.querySelector('.btn-test-kesubare');
    if (testBtn) {
      testBtn.addEventListener('click', () => {
        if (this.onSoundTest) {
          this.onSoundTest(this.config.kesuBare);
        } else {
          this.playSyntheticPokyun();
        }
      });
    }

    this.dom.overlay = overlay;
    this.dom.card = overlay.querySelector('.cabinet-modal-card');
    document.body.appendChild(overlay);

    this.syncUI();
  }

  /**
   * Play fallback web audio pokyun sound for test
   */
  playSyntheticPokyun() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.12);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.warn('AudioContext playback error', e);
    }
  }

  setValue(groupKey, value) {
    this.config[groupKey] = value;
    this.syncUI();
    this.saveToStorage();
    this.emitChange();
  }

  syncUI() {
    if (!this.dom.overlay) return;

    const pillGroups = this.dom.overlay.querySelectorAll('.pill-options');
    pillGroups.forEach((group) => {
      const key = group.dataset.group;
      const currentVal = this.config[key];
      const btns = group.querySelectorAll('.pill-btn');
      btns.forEach((btn) => {
        btn.classList.remove('active', 'active-red', 'active-rainbow');
        if (btn.dataset.value === currentVal) {
          if (currentVal === 'red' || currentVal === 'on' && key === 'revaburu') {
            btn.classList.add('active-red');
          } else if (currentVal === 'rainbow' || currentVal === 'on' && key === 'pFlash') {
            btn.classList.add('active-rainbow');
          } else {
            btn.classList.add('active');
          }
        }
      });
    });
  }

  emitChange() {
    if (this.onConfigChange) {
      this.onConfigChange({ ...this.config });
    }
  }

  open() {
    if (this.dom.overlay) {
      this.dom.overlay.classList.add('open');
      this.syncUI();
    }
  }

  close() {
    if (this.dom.overlay) {
      this.dom.overlay.classList.remove('open');
    }
  }

  toggle() {
    if (this.dom.overlay) {
      if (this.dom.overlay.classList.contains('open')) {
        this.close();
      } else {
        this.open();
      }
    }
  }

  getConfig() {
    return { ...this.config };
  }

  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.syncUI();
    this.saveToStorage();
    this.emitChange();
  }
}
