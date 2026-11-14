/**
 * ReelAnimation.js - 3-Reel Drum Animation & Tenpai Controller
 * e けすじー 〜超進化覚醒〜
 * Owned by screen-director
 */

export class ReelAnimation {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onReelStop = options.onReelStop || (() => {});
    this.onTenpai = options.onTenpai || (() => {});
    this.onReachVoice = options.onReachVoice || (() => {});

    // Symbol configuration with authentic character portraits from sozai/
    this.symbols = [
      { id: 1, name: 'けすじー', color: 'blue', label: '通常', img: 'sozai/0fc81d99-26ea-43ad-b45b-e694c036405e.jpg' },
      { id: 2, name: 'カラフル', color: 'blue', label: '通常', img: 'sozai/d6fe5f8a-d148-4ea7-9460-c3972d3d5c79.jpg' },
      { id: 3, name: 'インジェクト', color: 'red', label: '好機', img: 'sozai/Gemini_Generated_Image_295zkx295zkx295z.jpg' },
      { id: 4, name: 'スマート', color: 'blue', label: '通常', img: 'sozai/0fc81d99-26ea-43ad-b45b-e694c036405e.jpg' },
      { id: 5, name: '覚醒劇画', color: 'red', label: '好機', img: 'sozai/79e512b1-1660-4684-8edf-dbbab2e5b686.jpg' },
      { id: 6, name: 'ヒロイン', color: 'blue', label: '通常', img: 'sozai/d6fe5f8a-d148-4ea7-9460-c3972d3d5c79.jpg' },
      { id: 7, name: '神ケスモン', color: 'gold', label: '極熱', img: 'sozai/Gemini_Generated_Image_avlei7avlei7avle.jpg' },
      { id: 8, name: 'ビジネス', color: 'blue', label: '通常', img: 'sozai/0fc81d99-26ea-43ad-b45b-e694c036405e.jpg' },
      { id: 9, name: 'オーバード', color: 'red', label: '激熱', img: 'sozai/cb6abe99-59b3-4816-bafa-a53702082da8.jpg' },
      { id: 'ren', name: '擬似連', color: 'ren', label: '継続', img: 'sozai/79e512b1-1660-4684-8edf-dbbab2e5b686.jpg' },
      { id: 'chou', name: '超進化', color: 'chou', label: '覚醒', img: 'sozai/cb6abe99-59b3-4816-bafa-a53702082da8.jpg' }
    ];

    this.reels = [];
    this.reelElements = [];
    this.stripElements = [];
    this.currentSymbols = [1, 2, 3];
    this.isSpinning = [false, false, false];
    this.animFrameIds = [null, null, null];
    this.reelOffsets = [0, 0, 0];
    this.reelSpeeds = [0, 0, 0];
    this.itemHeight = 210; // corresponds to --reel-height (Virtual 843x576)

    this.tenpaiLaserEl = null;
    this.reachBannerEl = null;
    this.isTenpai = false;

    if (this.container) {
      this.init();
    }
  }

  /**
   * Initialize DOM structure inside given container
   */
  init(container) {
    if (container) this.container = container;
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="reels-stage" id="reels-stage">
        <div class="tenpai-laser" id="tenpai-laser"></div>
        <div class="reach-banner" id="reach-banner">リーチ！！</div>
        <div class="reel-column" id="reel-col-0" data-index="0">
          <div class="reel-strip" id="reel-strip-0"></div>
        </div>
        <div class="reel-column" id="reel-col-1" data-index="1">
          <div class="reel-strip" id="reel-strip-1"></div>
        </div>
        <div class="reel-column" id="reel-col-2" data-index="2">
          <div class="reel-strip" id="reel-strip-2"></div>
        </div>
      </div>
    `;

    this.stageEl = this.container.querySelector('#reels-stage');
    this.tenpaiLaserEl = this.container.querySelector('#tenpai-laser');
    this.reachBannerEl = this.container.querySelector('#reach-banner');

    for (let i = 0; i < 3; i++) {
      const col = this.container.querySelector(`#reel-col-${i}`);
      const strip = this.container.querySelector(`#reel-strip-${i}`);
      this.reelElements.push(col);
      this.stripElements.push(strip);

      // Populate initial strip with looping symbols
      this.populateStrip(strip, this.currentSymbols[i]);
    }
  }

  /**
   * Populate strip with repeated symbols for smooth infinite scrolling
   */
  populateStrip(stripEl, centerSymbolId) {
    stripEl.innerHTML = '';
    // Create a loop of 15 symbols to ensure smooth scrolling
    const symbolSequence = [
      7, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'ren', 'chou', 1, 2, 3, 7
    ];

    // Find index of centerSymbol
    const matchIdx = symbolSequence.indexOf(centerSymbolId);
    const startIdx = matchIdx !== -1 ? matchIdx : 3;

    for (let i = 0; i < symbolSequence.length; i++) {
      const symId = symbolSequence[i];
      const symData = this.symbols.find(s => s.id === symId) || this.symbols[0];
      const itemEl = document.createElement('div');
      itemEl.className = `symbol-item symbol-${symData.color}`;
      itemEl.dataset.symbolId = symData.id;

      const displayChar = symData.id === 'ren' ? '連' : (symData.id === 'chou' ? '超' : symData.id);
      itemEl.innerHTML = `
        <div class="symbol-card">
          <div class="symbol-char-bg" style="background-image: url('${symData.img}');"></div>
          <div class="symbol-card-frame"></div>
          <div class="symbol-top-tag">${symData.label}</div>
          <div class="symbol-num" data-text="${displayChar}">${displayChar}</div>
          <div class="symbol-label">${symData.name}</div>
        </div>
      `;
      stripEl.appendChild(itemEl);
    }

    // Set initial position centered
    const initialY = -(startIdx * this.itemHeight);
    stripEl.style.transform = `translateY(${initialY}px)`;
    const reelIdx = parseInt(stripEl.id.replace('reel-strip-', ''), 10);
    if (!isNaN(reelIdx)) {
      this.reelOffsets[reelIdx] = initialY;
    }
  }

  /**
   * Start spinning all reels with rapid motion blur
   */
  startSpin(speed = 36) {
    this.resetTenpai();

    for (let i = 0; i < 3; i++) {
      this.isSpinning[i] = true;
      this.reelSpeeds[i] = speed;
      this.reelElements[i].classList.add('spinning');
      this.reelElements[i].classList.remove('just-stopped');

      if (this.animFrameIds[i]) {
        cancelAnimationFrame(this.animFrameIds[i]);
      }
      this.animateSpin(i);
    }
  }

  /**
   * Per-frame animation loop for a single reel
   */
  animateSpin(index) {
    if (!this.isSpinning[index]) return;

    this.reelOffsets[index] -= this.reelSpeeds[index];
    const maxOffset = -(this.symbols.length * 2 * this.itemHeight);

    // Loop offset back around smoothly
    if (this.reelOffsets[index] <= maxOffset) {
      this.reelOffsets[index] += this.symbols.length * this.itemHeight;
    }

    this.stripElements[index].style.transform = `translate3d(0, ${this.reelOffsets[index]}px, 0)`;

    this.animFrameIds[index] = requestAnimationFrame(() => this.animateSpin(index));
  }

  /**
   * Stop a single reel smoothly onto targetSymbol
   */
  stopReel(index, targetSymbol, isReach = false) {
    return new Promise((resolve) => {
      if (!this.isSpinning[index]) {
        resolve();
        return;
      }

      this.isSpinning[index] = false;
      if (this.animFrameIds[index]) {
        cancelAnimationFrame(this.animFrameIds[index]);
        this.animFrameIds[index] = null;
      }

      this.reelElements[index].classList.remove('spinning');

      // Re-populate strip centered on targetSymbol
      this.currentSymbols[index] = targetSymbol;
      this.populateStrip(this.stripElements[index], targetSymbol);

      // Trigger mechanical bounce
      this.reelElements[index].classList.remove('just-stopped');
      void this.reelElements[index].offsetWidth; // trigger reflow
      this.reelElements[index].classList.add('just-stopped');

      this.onReelStop(index, targetSymbol);

      // Check for Tenpai if Left (0) and Right (2) are stopped
      if (!this.isSpinning[0] && !this.isSpinning[2] && index === 2) {
        if (this.currentSymbols[0] === this.currentSymbols[2]) {
          this.triggerTenpai(this.currentSymbols[0]);
        }
      }

      setTimeout(() => {
        resolve();
      }, 300);
    });
  }

  /**
   * Tenpai (聴牌/リーチ) activation
   */
  triggerTenpai(symbol) {
    this.isTenpai = true;
    if (this.tenpaiLaserEl) this.tenpaiLaserEl.classList.add('active');
    if (this.reachBannerEl) this.reachBannerEl.classList.add('active');

    // Slow down middle reel dramatically for intense reach anticipation
    if (this.isSpinning[1]) {
      this.reelSpeeds[1] = 6; // slow crawl
    }

    this.onTenpai(symbol);
    this.onReachVoice(symbol);
  }

  /**
   * Reset tenpai visuals
   */
  resetTenpai() {
    this.isTenpai = false;
    if (this.tenpaiLaserEl) this.tenpaiLaserEl.classList.remove('active');
    if (this.reachBannerEl) this.reachBannerEl.classList.remove('active');
  }

  /**
   * Middle reel slow crawling / heartbeat reach scroll
   */
  async scrollMiddleReelSlow(durationMs = 2500) {
    if (!this.isSpinning[1]) return;
    this.reelSpeeds[1] = 4; // very slow cinematic scroll
    await new Promise(r => setTimeout(r, durationMs));
  }

  /**
   * High-speed synchronized spin (全回転 / Zenkaiten)
   */
  spinZenkaiten(targetSymbol = 7) {
    this.resetTenpai();
    for (let i = 0; i < 3; i++) {
      this.isSpinning[i] = true;
      this.reelSpeeds[i] = 10; // synchronized steady spin
      this.reelElements[i].classList.add('spinning');
      if (this.animFrameIds[i]) cancelAnimationFrame(this.animFrameIds[i]);
      this.animateSpin(i);
    }
  }

  /**
   * Set stage scale mode (normal vs mini for video SP reach)
   */
  setMiniMode(isMini) {
    if (!this.stageEl) return;
    if (isMini) {
      this.stageEl.classList.add('mini-mode');
    } else {
      this.stageEl.classList.remove('mini-mode');
    }
  }

  /**
   * Hide / Show reels entirely (for climax full-screen videos)
   */
  setVisible(visible) {
    if (!this.stageEl) return;
    if (visible) {
      this.stageEl.classList.remove('hidden-stage');
    } else {
      this.stageEl.classList.add('hidden-stage');
    }
  }

  /**
   * Reset all reels to default idle state
   */
  reset(symbols = [1, 2, 3]) {
    this.resetTenpai();
    for (let i = 0; i < 3; i++) {
      this.isSpinning[i] = false;
      if (this.animFrameIds[i]) {
        cancelAnimationFrame(this.animFrameIds[i]);
        this.animFrameIds[i] = null;
      }
      this.reelElements[i]?.classList.remove('spinning', 'just-stopped');
      this.currentSymbols[i] = symbols[i];
      if (this.stripElements[i]) {
        this.populateStrip(this.stripElements[i], symbols[i]);
      }
    }
    this.setMiniMode(false);
    this.setVisible(true);
  }
}
