/**
 * ScreenDirector.js - Master LCD Stage & Sequence Controller
 * e けすじー 〜超進化覚醒〜
 * Owned by screen-director
 */

import { ReelAnimation } from './ReelAnimation.js';
import { PseudoSeries } from './PseudoSeries.js';
import { ChanceUpSystem } from './ChanceUpSystem.js';

export class ScreenDirector {
  constructor(options = {}) {
    this.container = options.container || null;
    this.cabinet = options.cabinet || null;
    this.mediaManager = options.mediaManager || null;
    this.soundController = options.soundController || options.mediaManager?.sound || null;
    this.videoPlayer = options.videoPlayer || options.mediaManager?.video || null;

    // Sub-modules
    this.reelAnimation = null;
    this.pseudoSeries = null;
    this.chanceUpSystem = null;

    // State
    this.currentMode = 'NORMAL'; // NORMAL, RUSH_LOW, RUSH_HIGH_LT, BONUS
    this.isSpinning = false;
    this.reserves = { heso: [], denchu: [] };

    // DOM references
    this.dom = {
      root: null,
      bg: null,
      stageBadgeText: null,
      hesoReserveGroup: null,
      denchuReserveGroup: null,
      reelsMount: null,
      pseudoMount: null,
      chanceUpMount: null,
      videoMount: null
    };

    if (this.container) {
      this.init();
    }
  }

  /**
   * Mount and initialize the LCD screen inside container
   * @param {HTMLElement|string} containerOrSelector
   */
  init(containerOrSelector) {
    if (typeof document === 'undefined') return;

    if (containerOrSelector) {
      if (typeof containerOrSelector === 'string') {
        this.container = document.querySelector(containerOrSelector);
      } else {
        this.container = containerOrSelector;
      }
    }

    if (!this.container) return;

    this.container.innerHTML = `
      <div class="lcd-screen-container" id="lcd-screen-container">
        <!-- Stage Background -->
        <div class="lcd-stage-bg stage-normal" id="lcd-stage-bg"></div>
        <div class="lcd-grid-overlay"></div>

        <!-- Top HUD (Stage Name & Reserves) -->
        <header class="lcd-top-hud">
          <div class="stage-badge" id="lcd-stage-badge">
            <span class="dot"></span>
            <span id="stage-badge-text">通常ステージ</span>
          </div>

          <div class="reserves-panel">
            <div class="reserves-group">
              <span class="reserves-label">ヘソ:</span>
              <div class="reserve-orbs-wrap" id="reserves-heso-wrap" style="display: flex; gap: 4px;">
                <div class="reserve-orb" data-slot="0"></div>
                <div class="reserve-orb" data-slot="1"></div>
                <div class="reserve-orb" data-slot="2"></div>
                <div class="reserve-orb" data-slot="3"></div>
              </div>
            </div>
            <div class="reserves-group">
              <span class="reserves-label">電:</span>
              <div class="reserve-orbs-wrap" id="reserves-denchu-wrap" style="display: flex; gap: 4px;">
                <div class="reserve-orb" data-slot="0"></div>
                <div class="reserve-orb" data-slot="1"></div>
                <div class="reserve-orb" data-slot="2"></div>
                <div class="reserve-orb" data-slot="3"></div>
              </div>
            </div>
          </div>
        </header>

        <!-- Sub-module mount points -->
        <div class="sub-mount-layer" id="reels-layer-mount" style="position: absolute; inset: 0;"></div>
        <div class="sub-mount-layer" id="pseudo-layer-mount" style="position: absolute; inset: 0; pointer-events: none;"></div>
        <div class="sub-mount-layer" id="chanceup-layer-mount" style="position: absolute; inset: 0; pointer-events: none;"></div>
      </div>
    `;

    this.dom.root = this.container.querySelector('#lcd-screen-container');
    this.dom.bg = this.container.querySelector('#lcd-stage-bg');
    this.dom.stageBadgeText = this.container.querySelector('#stage-badge-text');
    this.dom.hesoReserveGroup = this.container.querySelector('#reserves-heso-wrap');
    this.dom.denchuReserveGroup = this.container.querySelector('#reserves-denchu-wrap');

    const reelsMount = this.container.querySelector('#reels-layer-mount');
    const pseudoMount = this.container.querySelector('#pseudo-layer-mount');
    const chanceUpMount = this.container.querySelector('#chanceup-layer-mount');

    // 1. Initialize ReelAnimation
    this.reelAnimation = new ReelAnimation({
      container: reelsMount,
      onReelStop: (index, symbol) => {
        this.soundController?.playReelStop?.(index, symbol);
        if (index === 1) {
          this.soundController?.stopReelSpin?.();
        }
      },
      onTenpai: (symbol) => {
        this.soundController?.playTenpai?.(symbol);
        this.cabinet?.setLightingPattern?.('warning', 2500);
      }
    });

    // 2. Initialize PseudoSeries
    this.pseudoSeries = new PseudoSeries({
      container: pseudoMount,
      screenContainer: this.dom.root,
      onPseudoStep: (step) => {
        this.soundController?.playPseudo?.(step);
      }
    });

    // 3. Initialize ChanceUpSystem
    this.chanceUpSystem = new ChanceUpSystem({
      container: chanceUpMount,
      onChanceUpSound: (type, color) => {
        this.soundController?.playChanceUp?.(type, color);
      },
      onButtonPress: (type) => {
        this.soundController?.playButtonPush?.(true);
        this.cabinet?.setLightingPattern?.('red-flash', 500);
      },
      onLightGuideFlash: (color) => {
        this.cabinet?.flashIllumination?.(color, 2, 150);
      }
    });

    // 4. Setup Dynamic Resolution Scaling (Virtual 843 x 576 fit to container)
    this.setupScaling();
  }

  /**
   * Setup auto-scaling to fit virtual 843x576 LCD resolution into any container size
   */
  setupScaling() {
    const update = () => {
      if (!this.container || !this.dom.root) return;
      // Use unscaled layout clientWidth/clientHeight so parent CSS zoom transforms don't double-scale!
      const w = this.container.clientWidth || this.container.offsetWidth;
      const h = this.container.clientHeight || this.container.offsetHeight;
      if (w > 0 && h > 0) {
        // Virtual resolution is 843 x 576 (281:192 physical cabinet ratio)
        const scaleX = w / 843;
        const scaleY = h / 576;
        const scale = Math.min(scaleX, scaleY);
        this.dom.root.style.setProperty('--lcd-scale', scale);
      }
    };

    // Run immediately and on next frame to ensure DOM layout
    update();
    requestAnimationFrame(update);
    setTimeout(update, 100);

    window.addEventListener('resize', update);
    if (typeof ResizeObserver !== 'undefined' && this.container) {
      this._resizeObserver = new ResizeObserver(update);
      this._resizeObserver.observe(this.container);
    }
  }

  setCabinet(cabinet) {
    this.cabinet = cabinet;
  }

  setMedia(mediaManager) {
    this.mediaManager = mediaManager;
    this.soundController = mediaManager?.sound || mediaManager;
    this.videoPlayer = mediaManager?.video || null;
  }

  /**
   * Set game mode & update background atmosphere
   * @param {'NORMAL'|'RUSH_LOW'|'RUSH_HIGH_LT'|'BONUS'} mode
   */
  setMode(mode) {
    this.currentMode = mode;
    this.cabinet?.setPlayfieldMode?.(mode);
    if (!this.dom.bg) return;

    this.dom.bg.className = 'lcd-stage-bg';

    switch (mode) {
      case 'RUSH_LOW':
        this.dom.bg.classList.add('stage-rush');
        if (this.dom.stageBadgeText) this.dom.stageBadgeText.textContent = 'けすRUSH (ST100回)';
        break;
      case 'RUSH_HIGH_LT':
        this.dom.bg.classList.add('stage-lt');
        if (this.dom.stageBadgeText) this.dom.stageBadgeText.textContent = '極・オーバードRUSH (LT 89.5%)';
        break;
      case 'BONUS':
        this.dom.bg.classList.add('stage-rush');
        if (this.dom.stageBadgeText) this.dom.stageBadgeText.textContent = 'BONUS FEVER';
        break;
      case 'NORMAL':
      default:
        this.dom.bg.classList.add('stage-normal');
        if (this.dom.stageBadgeText) this.dom.stageBadgeText.textContent = '通常ステージ';
        break;
    }
  }

  /**
   * Update reserve display (Heso & Denchu queues)
   * @param {Array<Object>} hesoList
   * @param {Array<Object>} denchuList
   */
  updateReserves(hesoList = [], denchuList = []) {
    if (this.dom.hesoReserveGroup) {
      const orbs = this.dom.hesoReserveGroup.querySelectorAll('.reserve-orb');
      orbs.forEach((orb, idx) => {
        orb.className = 'reserve-orb';
        if (idx < hesoList.length) {
          const item = hesoList[idx];
          const iconType = (item?.icon || item?.reserveIcon || 'WHITE').toLowerCase();
          orb.classList.add(`active-${iconType}`);
        }
      });
    }

    if (this.dom.denchuReserveGroup) {
      const orbs = this.dom.denchuReserveGroup.querySelectorAll('.reserve-orb');
      orbs.forEach((orb, idx) => {
        orb.className = 'reserve-orb';
        if (idx < denchuList.length) {
          const item = denchuList[idx];
          const iconType = (item?.icon || item?.reserveIcon || 'WHITE').toLowerCase();
          orb.classList.add(`active-${iconType}`);
        }
      });
    }
  }

  /**
   * Play full cinematic simulation sequence for a single scenario
   * @param {Object} scenario - Scenario object generated by ScenarioBuilder
   * @returns {Promise<{ isHit: boolean, payout: number, nextState: string }>}
   */
  async playScenario(scenario) {
    if (this.isSpinning) {
      console.warn('[ScreenDirector] Already spinning, dropping concurrent call');
      return { isHit: false, payout: 0, nextState: this.currentMode };
    }

    this.isSpinning = true;

    try {
      // 1. Advance notices (Kesu-Bare, Revaburu, Light Guide)
      if (scenario.flags?.kesuBare) {
        this.soundController?.playKesuBarePokyun?.();
        this.cabinet?.flashIllumination?.('red', 3, 120);
        this.cabinet?.triggerGimmick?.('sakiyomi', 1800);
        await this.chanceUpSystem.flashLightGuide('red', 2);
      }

      if (scenario.flags?.revaburu) {
        this.soundController?.playRevaburu?.();
        this.pseudoSeries.startRumble(800);
        this.cabinet?.controls?.triggerRumble?.(800);
        this.cabinet?.triggerGimmick?.('sakiyomi', 2000);
      }

      if (scenario.flags?.vFlash) {
        this.soundController?.playVFlash?.();
        this.cabinet?.triggerVFlash?.();
        this.cabinet?.triggerGimmick?.('fever', 3000);
      }

      // 2. Start Reel Spinning
      this.soundController?.playReelSpinStart?.();
      this.reelAnimation.startSpin(36);

      // 3. Pseudo-chains (擬似連)
      const pseudoCount = scenario.pseudoChains || 1;
      if (pseudoCount > 1) {
        for (let step = 2; step <= pseudoCount; step++) {
          await new Promise(r => setTimeout(r, 900));

          // Quick center stop on special 'ren' or 'chou' symbol
          const specialSym = step === 3 ? 'chou' : 'ren';
          await this.reelAnimation.stopReel(1, specialSym);

          // Move physical Cyborg Kesji gimmick on pseudo step!
          this.cabinet?.triggerGimmick?.(step >= 3 ? 'pseudo3' : 'pseudo2', step >= 3 ? 2400 : 1800);

          // Play pseudo animation banner & sound
          await this.pseudoSeries.playStep(step);

          // Resume spin
          this.reelAnimation.startSpin(38);
        }
      }

      // 4. Reach Branch Execution
      const reachType = scenario.reachType || 'NONE';
      const symbols = scenario.symbols || { left: 1, middle: 2, right: 3 };

      if (reachType !== 'NONE') {
        const isClimaxReach = reachType === 'CLIMAX_SP' || reachType === 'ZENKAITEN';
        this.cabinet?.notifyReachStart?.(isClimaxReach);
      }

      if (reachType === 'ZENKAITEN') {
        // 全回転プレミア (Zenkaiten Climax)
        this.cabinet?.triggerGimmick?.('fever', 8000);
        await this.executeZenkaitenReach(scenario);
      } else if (reachType === 'CLIMAX_SP') {
        // オーバードケスモン超進化SPリーチ (Climax SP Reach)
        this.cabinet?.triggerGimmick?.('climax_drop', 3800);
        await this.executeClimaxSpReach(scenario);
      } else if (reachType === 'CHARACTER_SP') {
        // キャラクターSPバトルリーチ
        this.cabinet?.triggerGimmick?.('pseudo3', 2800);
        await this.executeCharacterSpReach(scenario);
      } else if (reachType === 'NORMAL_REACH') {
        // ノーマルリーチ
        this.cabinet?.triggerGimmick?.('pseudo2', 1800);
        await this.executeNormalReach(scenario);
      } else {
        // ノーマルハズレ (No Reach)
        await this.executeNoReach(symbols);
      }

      // 5. Win / Lose Resolution
      if (scenario.isHit) {
        this.cabinet?.triggerGimmick?.('fever', 5000);
        await this.executeWinCelebration(scenario);
      }

      this.chanceUpSystem.clearAll();
      this.reelAnimation.resetTenpai();

      return {
        isHit: scenario.isHit,
        payout: scenario.payout || 0,
        nextState: scenario.nextState || this.currentMode
      };

    } finally {
      this.soundController?.stopReelSpin?.();
      this.cabinet?.notifyReachEnd?.();
      this.isSpinning = false;
    }
  }

  /**
   * Normal Spin (No Reach)
   */
  async executeNoReach(symbols) {
    await new Promise(r => setTimeout(r, 600));
    await this.reelAnimation.stopReel(0, symbols.left);
    await new Promise(r => setTimeout(r, 300));
    await this.reelAnimation.stopReel(2, symbols.right);
    await new Promise(r => setTimeout(r, 300));
    await this.reelAnimation.stopReel(1, symbols.middle);
  }

  /**
   * Normal Reach
   */
  async executeNormalReach(scenario) {
    const { symbols, chanceUp } = scenario;

    await new Promise(r => setTimeout(r, 600));
    await this.reelAnimation.stopReel(0, symbols.left);
    await new Promise(r => setTimeout(r, 350));
    await this.reelAnimation.stopReel(2, symbols.right);

    // Title & Telop
    this.chanceUpSystem.showTitle('ノーマルリーチ', (chanceUp?.title || 'white').toLowerCase(), 2500);
    this.chanceUpSystem.showTelop('揃うか…！？', (chanceUp?.telop || 'white').toLowerCase(), 2500);

    // Middle reel slow crawl
    await this.reelAnimation.scrollMiddleReelSlow(2000);
    await this.reelAnimation.stopReel(1, symbols.middle);
  }

  /**
   * Character SP Reach
   */
  async executeCharacterSpReach(scenario) {
    const { symbols, chanceUp } = scenario;

    await new Promise(r => setTimeout(r, 600));
    await this.reelAnimation.stopReel(0, symbols.left);
    await new Promise(r => setTimeout(r, 350));
    await this.reelAnimation.stopReel(2, symbols.right);

    // Chance Up: Title & Light Guide
    const titleColor = (chanceUp?.title || 'red').toLowerCase();
    const telopColor = (chanceUp?.telop || 'white').toLowerCase();

    this.chanceUpSystem.showTitle('キャラクターSPバトル', titleColor, 4000);
    this.chanceUpSystem.showTelop('敵を撃破せよ！！', telopColor, 4000);
    await this.chanceUpSystem.flashLightGuide(titleColor === 'gold' ? 'gold' : 'red', 2);

    // Middle reel intense spin
    await this.reelAnimation.scrollMiddleReelSlow(1500);

    // Cut-In
    if (chanceUp?.cutin && chanceUp.cutin !== 'NONE') {
      const cutinGrade = chanceUp.cutin.toLowerCase();
      await this.chanceUpSystem.showCutIn(cutinGrade);
    }

    // Button Prompt
    const buttonType = (chanceUp?.button || 'normal').toLowerCase();
    await this.chanceUpSystem.showDecisionButton(buttonType, { timeout: 4500 });

    // Stop Middle Reel
    await this.reelAnimation.stopReel(1, symbols.middle);
  }

  /**
   * Climax SP Reach: オーバードケスモン超進化
   */
  async executeClimaxSpReach(scenario) {
    const { symbols, chanceUp } = scenario;

    await new Promise(r => setTimeout(r, 600));
    await this.reelAnimation.stopReel(0, symbols.left);
    await new Promise(r => setTimeout(r, 350));
    await this.reelAnimation.stopReel(2, symbols.right);

    // Blackout & Light Guide Gold Flash
    await this.chanceUpSystem.flashLightGuide('gold', 3);
    this.pseudoSeries.startRumble(1200);

    // Title & Telop (Gold/Red)
    const titleColor = (chanceUp?.title || 'gold').toLowerCase();
    this.chanceUpSystem.showTitle('オーバードケスモン超進化リーチ', titleColor, 6000);
    this.chanceUpSystem.showTelop('超進化覚醒！すべての力を解き放てーッ！！', 'gold', 6000);

    // Shrink reels to mini HUD
    this.reelAnimation.setMiniMode(true);

    // Seamless Video Playback if VideoPlayer is attached
    if (this.videoPlayer) {
      try {
        await this.videoPlayer.play('climax_sp', { timeout: 10000 });
      } catch (e) {
        console.warn('[ScreenDirector] Climax video playback fallback:', e);
      }
    } else {
      await new Promise(r => setTimeout(r, 3000));
    }

    // Climax Gekiatsu Cut-in & Gimmick Slam
    this.cabinet?.triggerGimmick?.('climax_drop', 3600);
    await this.chanceUpSystem.showCutIn(chanceUp?.cutin ? chanceUp.cutin.toLowerCase() : 'gekiatsu');

    // Climax Decision Button / Lever
    const buttonType = (chanceUp?.button || 'gekiatsu').toLowerCase();
    await this.chanceUpSystem.showDecisionButton(buttonType, { timeout: 5000 });

    // Return reels from mini mode & Final Stop
    this.reelAnimation.setMiniMode(false);
    await this.reelAnimation.stopReel(1, symbols.middle);
  }

  /**
   * Zenkaiten Climax (全回転)
   */
  async executeZenkaitenReach(scenario) {
    this.chanceUpSystem.showTitle('歓喜の全回転リーチ', 'rainbow', 12000);
    this.chanceUpSystem.showTelop('至福の瞬間！3000個＋超ケスジーRUSH LT確定！！', 'gold', 12000);

    // Synchronized 7-7-7 spin
    this.reelAnimation.spinZenkaiten(7);

    if (this.videoPlayer) {
      try {
        await this.videoPlayer.play('zenkaiten', { timeout: 12000 });
      } catch (e) {
        console.warn('[ScreenDirector] Zenkaiten video playback fallback:', e);
      }
    } else {
      await new Promise(r => setTimeout(r, 4000));
    }

    // Stop simultaneously on 7-7-7
    await Promise.all([
      this.reelAnimation.stopReel(0, 7),
      this.reelAnimation.stopReel(1, 7),
      this.reelAnimation.stopReel(2, 7)
    ]);
  }

  /**
   * Win / Jackpot Celebration
   */
  async executeWinCelebration(scenario) {
    const payout = scenario.payout || 1500;
    const hitTitle = scenario.hitType === 'PREMIUM_FEVER_3000' ? '極FEVER 3000' : '大当り FEVER';

    this.soundController?.playFeverFanfare?.();
    this.cabinet?.setLightingPattern?.('fever', 5000);
    this.chanceUpSystem.showWinCelebration(payout, hitTitle);

    await new Promise(r => setTimeout(r, 3500));
    this.chanceUpSystem.hideWinCelebration();
  }

  /**
   * Reset Screen Director to initial state
   */
  reset() {
    this.isSpinning = false;
    this.reelAnimation?.reset();
    this.pseudoSeries?.clear();
    this.chanceUpSystem?.clearAll();
    this.setMode('NORMAL');
    this.updateReserves([], []);
  }
}
