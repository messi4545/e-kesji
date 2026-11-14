/**
 * PseudoSeries.js - Pachinko Pseudo-Chains (擬似連) Controller
 * e けすじー 〜超進化覚醒〜
 * Owned by screen-director
 */

export class PseudoSeries {
  constructor(options = {}) {
    this.container = options.container || null;
    this.screenContainer = options.screenContainer || null;
    this.onPseudoStep = options.onPseudoStep || (() => {});
    this.onPseudoVoice = options.onPseudoVoice || (() => {});
    this.onRumbleStart = options.onRumbleStart || (() => {});
    this.onRumbleEnd = options.onRumbleEnd || (() => {});

    this.overlayEl = null;
    this.glassCrackEl = null;

    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize DOM elements for pseudo-series overlays
   */
  init(container, screenContainer) {
    if (container) this.container = container;
    if (screenContainer) this.screenContainer = screenContainer;
    if (!this.container) return;

    // Create glass shatter layer
    this.glassCrackEl = document.createElement('div');
    this.glassCrackEl.className = 'glass-crack-layer';
    this.container.appendChild(this.glassCrackEl);

    // Create pseudo overlay
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'pseudo-overlay';
    this.overlayEl.innerHTML = `
      <div class="pseudo-giji2-text">まだまだぁ！！</div>
      <div class="pseudo-giji3-box">
        <div class="pseudo-giji3-badge">激熱予告</div>
        <div class="pseudo-giji3-kanji">超進化セヨ！</div>
      </div>
      <div class="pseudo-giji4-box">
        <div class="pseudo-giji4-title">歓喜の全回転</div>
      </div>
    `;
    this.container.appendChild(this.overlayEl);
  }

  /**
   * Trigger screen shatter / crack visual effect
   */
  shatter() {
    if (!this.glassCrackEl) return;
    this.glassCrackEl.classList.remove('shatter');
    void this.glassCrackEl.offsetWidth; // trigger reflow
    this.glassCrackEl.classList.add('shatter');
  }

  /**
   * Trigger screen rumble
   */
  startRumble(durationMs = 600) {
    if (this.screenContainer) {
      this.screenContainer.classList.add('rumble');
    }
    this.onRumbleStart();

    if (durationMs > 0) {
      setTimeout(() => {
        this.stopRumble();
      }, durationMs);
    }
  }

  /**
   * Stop screen rumble
   */
  stopRumble() {
    if (this.screenContainer) {
      this.screenContainer.classList.remove('rumble');
    }
    this.onRumbleEnd();
  }

  /**
   * Play specific pseudo-step sequence (2, 3, or 4)
   * @param {number} step - 2 (まだまだぁ！), 3 (超進化セヨ！), 4 (全回転)
   * @returns {Promise<void>}
   */
  async playStep(step) {
    this.clear();
    if (!this.overlayEl) return;

    this.onPseudoStep(step);
    this.onPseudoVoice(step);

    this.overlayEl.classList.add('active', `step-${step}`);
    this.shatter();

    if (step === 2) {
      this.startRumble(500);
      await new Promise(r => setTimeout(r, 1200));
    } else if (step === 3) {
      this.startRumble(1100);
      await new Promise(r => setTimeout(r, 1600));
    } else if (step === 4) {
      this.startRumble(1500);
      await new Promise(r => setTimeout(r, 2000));
    }

    this.clear();
  }

  /**
   * Clear all active pseudo overlays
   */
  clear() {
    if (!this.overlayEl) return;
    this.overlayEl.classList.remove('active', 'step-2', 'step-3', 'step-4');
    this.stopRumble();
  }
}
