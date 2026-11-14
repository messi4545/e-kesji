/**
 * ChanceUpSystem.js - Multi-layered Chance-Up, Cut-in & Button Prompts
 * e けすじー 〜超進化覚醒〜
 * Owned by screen-director
 */

export class ChanceUpSystem {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onChanceUpSound = options.onChanceUpSound || (() => {});
    this.onButtonPress = options.onButtonPress || (() => {});
    this.onLightGuideFlash = options.onLightGuideFlash || (() => {});

    // Elements
    this.titleContainer = null;
    this.titleBadge = null;
    this.telopContainer = null;
    this.lightGuideEl = null;
    this.cutInContainer = null;
    this.cutInBanner = null;
    this.cutInContent = null;
    this.decisionOverlay = null;
    this.winOverlay = null;

    this.titleTimer = null;
    this.telopTimer = null;
    this.buttonResolve = null;

    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize DOM layers for Chance-Up system
   */
  init(container) {
    if (container) this.container = container;
    if (!this.container) return;

    // 1. Light Guide Flash Overlay
    this.lightGuideEl = document.createElement('div');
    this.lightGuideEl.className = 'light-guide-overlay';
    this.container.appendChild(this.lightGuideEl);

    // 2. Title Container
    this.titleContainer = document.createElement('div');
    this.titleContainer.className = 'cu-title-container';
    this.titleContainer.innerHTML = '<div class="cu-title-badge cu-title-white" id="cu-title-badge"></div>';
    this.titleBadge = this.titleContainer.querySelector('#cu-title-badge');
    this.container.appendChild(this.titleContainer);

    // 3. Telop Container
    this.telopContainer = document.createElement('div');
    this.telopContainer.className = 'cu-telop-container cu-telop-white';
    this.container.appendChild(this.telopContainer);

    // 4. Cut-in Container
    this.cutInContainer = document.createElement('div');
    this.cutInContainer.className = 'cut-in-container';
    this.cutInContainer.innerHTML = `
      <div class="cut-in-banner cut-in-normal" id="cut-in-banner">
        <div class="cut-in-content" id="cut-in-content"></div>
      </div>
    `;
    this.cutInBanner = this.cutInContainer.querySelector('#cut-in-banner');
    this.cutInContent = this.cutInContainer.querySelector('#cut-in-content');
    this.container.appendChild(this.cutInContainer);

    // 5. Decision Prompt Overlay (Button / Lever)
    this.decisionOverlay = document.createElement('div');
    this.decisionOverlay.className = 'decision-prompt-overlay';
    this.container.appendChild(this.decisionOverlay);

    // 6. Win Announcement Overlay
    this.winOverlay = document.createElement('div');
    this.winOverlay.className = 'win-announcement-overlay';
    this.winOverlay.innerHTML = `
      <div class="win-sunburst"></div>
      <div class="win-title-huge" id="win-title">大当り</div>
      <div class="win-sub-payout" id="win-payout">1500 FEVER</div>
    `;
    this.winTitleEl = this.winOverlay.querySelector('#win-title');
    this.winPayoutEl = this.winOverlay.querySelector('#win-payout');
    this.container.appendChild(this.winOverlay);
  }

  /**
   * Show SP Reach Title with color tier
   * @param {string} text - Title text (e.g. "超進化SPリーチ")
   * @param {'white'|'red'|'gold'|'rainbow'} color - Color tier
   * @param {number} durationMs - Auto-hide duration (0 for no auto-hide)
   */
  showTitle(text, color = 'white', durationMs = 3500) {
    if (!this.titleContainer || !this.titleBadge) return;
    clearTimeout(this.titleTimer);

    this.titleBadge.textContent = text;
    this.titleBadge.className = `cu-title-badge cu-title-${color}`;
    this.titleContainer.classList.add('active');

    this.onChanceUpSound('title', color);

    if (durationMs > 0) {
      this.titleTimer = setTimeout(() => {
        this.hideTitle();
      }, durationMs);
    }
  }

  hideTitle() {
    if (!this.titleContainer) return;
    this.titleContainer.classList.remove('active');
  }

  /**
   * Show Subtitle Telop with color tier
   * @param {string} text - Telop dialogue / caption
   * @param {'white'|'red'|'gold'} color - Color tier
   * @param {number} durationMs - Auto-hide duration
   */
  showTelop(text, color = 'white', durationMs = 4000) {
    if (!this.telopContainer) return;
    clearTimeout(this.telopTimer);

    this.telopContainer.textContent = text;
    this.telopContainer.className = `cu-telop-container cu-telop-${color} active`;

    this.onChanceUpSound('telop', color);

    if (durationMs > 0) {
      this.telopTimer = setTimeout(() => {
        this.hideTelop();
      }, durationMs);
    }
  }

  hideTelop() {
    if (!this.telopContainer) return;
    this.telopContainer.classList.remove('active');
  }

  /**
   * Flash light guide panel
   * @param {'white'|'red'|'gold'|'rainbow'} color - Flash color
   * @param {number} count - Flash repetitions
   */
  async flashLightGuide(color = 'white', count = 2) {
    if (!this.lightGuideEl) return;
    this.onLightGuideFlash(color);

    for (let i = 0; i < count; i++) {
      this.lightGuideEl.className = `light-guide-overlay flash-${color}`;
      await new Promise(r => setTimeout(r, 120));
      this.lightGuideEl.className = 'light-guide-overlay';
      await new Promise(r => setTimeout(r, 80));
    }
  }

  /**
   * Show Character Cut-In Slash
   * @param {'normal'|'chance'|'gekiatsu'} grade - Cut-in grade
   * @param {Object} options - Custom image / text overrides
   * @returns {Promise<void>}
   */
  async showCutIn(grade = 'normal', options = {}) {
    if (!this.cutInContainer || !this.cutInBanner || !this.cutInContent) return;

    let phrase = 'いくぞっ！！';
    let tag = 'CHANCE';
    let imgSrc = options.imgSrc || 'sozai/79e512b1-1660-4684-8edf-dbbab2e5b686.jpg';

    if (grade === 'chance') {
      phrase = '本気を見せてやる！！';
      tag = 'CHANCE UP';
      imgSrc = options.imgSrc || 'sozai/cb6abe99-59b3-4816-bafa-a53702082da8.jpg';
    } else if (grade === 'gekiatsu') {
      phrase = '超進化覚醒完了！激熱！';
      tag = 'GEKI-ATSU!!';
      imgSrc = options.imgSrc || 'sozai/d6fe5f8a-d148-4ea7-9460-c3972d3d5c79.jpg';
    }

    if (options.phrase) phrase = options.phrase;
    if (options.tag) tag = options.tag;

    this.cutInBanner.className = `cut-in-banner cut-in-${grade}`;
    this.cutInContent.innerHTML = `
      <img src="${imgSrc}" class="cut-in-img" alt="cut-in character" onerror="this.style.display='none'">
      <div class="cut-in-text-box">
        <div class="cut-in-tag">${tag}</div>
        <div class="cut-in-phrase">${phrase}</div>
      </div>
    `;

    this.cutInContainer.classList.add('active');
    this.onChanceUpSound('cutin', grade);

    await new Promise(r => setTimeout(r, 1200));
    this.cutInContainer.classList.remove('active');
  }

  /**
   * Show Final Decision Button or Lever Prompt
   * @param {'normal'|'deka'|'gekiatsu'|'lever'} type - Device prompt type
   * @param {Object} options - Optional parameters
   * @returns {Promise<boolean>} Resolves true when pressed
   */
  showDecisionButton(type = 'normal', options = {}) {
    return new Promise((resolve) => {
      if (!this.decisionOverlay) {
        resolve(true);
        return;
      }

      this.buttonResolve = resolve;
      const timeoutMs = options.timeout || 6000;

      let buttonClass = 'normal';
      let isLever = false;

      const normType = (type || 'normal').toLowerCase();
      if (normType === 'popupout_lever' || normType === 'lever') {
        isLever = true;
      } else if (normType === 'big' || normType === 'deka') {
        buttonClass = 'deka';
      } else if (normType === 'gekiatsu' || normType === 'rainbow_v' || normType === 'red') {
        buttonClass = 'gekiatsu';
      }

      if (isLever) {
        this.decisionOverlay.innerHTML = `
          <div class="decision-btn-wrapper type-lever" id="active-decision-device">
            <div class="decision-lever-core">
              <div class="decision-lever-arrow">▼</div>
              <div class="decision-btn-title">レバーを引け！</div>
            </div>
          </div>
        `;
      } else {
        const subtitle = buttonClass === 'gekiatsu' ? '激熱一撃！' : (buttonClass === 'deka' ? '大当りを掴め！' : 'PUSH!');
        this.decisionOverlay.innerHTML = `
          <div class="decision-btn-wrapper type-${buttonClass}" id="active-decision-device">
            <div class="decision-btn-core">
              <div class="decision-btn-title">PUSH</div>
              <div class="decision-btn-subtitle">${subtitle}</div>
            </div>
          </div>
        `;
      }

      const deviceEl = this.decisionOverlay.querySelector('#active-decision-device');
      const pressHandler = () => {
        if (!this.buttonResolve) return;
        this.onButtonPress(type);
        this.hideDecisionButton();
        const r = this.buttonResolve;
        this.buttonResolve = null;
        r(true);
      };

      deviceEl.addEventListener('click', pressHandler, { once: true });

      // Auto press after timeout to avoid getting stuck
      this.decisionTimer = setTimeout(() => {
        pressHandler();
      }, timeoutMs);

      this.decisionOverlay.classList.add('active');
      this.onChanceUpSound('button_appear', type);
    });
  }

  hideDecisionButton() {
    clearTimeout(this.decisionTimer);
    if (!this.decisionOverlay) return;
    this.decisionOverlay.classList.remove('active');
    this.decisionOverlay.innerHTML = '';
  }

  /**
   * Show Win Jackpot Celebration
   * @param {number} payout - Ball payout (1500, 3000, 300)
   * @param {string} title - Win title (大当り, けすFEVER, 極FEVER)
   */
  showWinCelebration(payout = 1500, title = '大当り') {
    if (!this.winOverlay) return;
    if (this.winTitleEl) this.winTitleEl.textContent = title;
    if (this.winPayoutEl) this.winPayoutEl.textContent = `FEVER ${payout} 個`;

    this.winOverlay.classList.add('active');
  }

  hideWinCelebration() {
    if (!this.winOverlay) return;
    this.winOverlay.classList.remove('active');
  }

  /**
   * Clear all active layers immediately
   */
  clearAll() {
    this.hideTitle();
    this.hideTelop();
    this.hideDecisionButton();
    this.hideWinCelebration();
    if (this.cutInContainer) this.cutInContainer.classList.remove('active');
    if (this.lightGuideEl) this.lightGuideEl.className = 'light-guide-overlay';
  }
}
