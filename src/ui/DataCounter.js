/**
 * DataCounter.js - Real-time Digital Pachinko Data Counter & Slump Graph
 * for 'e けすじー'
 */

export class DataCounter {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onToggleModal = options.onToggleModal || null;

    // Game stats
    this.spins = 0;              // Current rotations since last bonus
    this.totalSpins = 0;         // Total rotations in session
    this.bbCount = 0;            // Big Bonus (FEVER / LT)
    this.rbCount = 0;            // Regular / Minor Bonus
    this.currentStreak = 0;      // Current consecutive chain
    this.maxStreak = 0;          // Max chain recorded
    this.totalPayout = 0;        // Total balls won
    this.ballsShot = 0;          // Total balls fired
    this.ballDiff = 0;           // Net ball difference (獲得差玉)
    this.mode = 'NORMAL';        // NORMAL, BONUS, RUSH_LOW, RUSH_HIGH_LT

    // Slump graph history points: [{ spin: 0, diff: 0, isBonus: false }]
    this.slumpPoints = [{ spin: 0, diff: 0, isBonus: false }];

    // Bonus history log: [{ id, spins, type, balls, streak, time }]
    this.history = [];

    // DOM Elements cache
    this.dom = {
      root: null,
      spinsVal: null,
      bbVal: null,
      rbVal: null,
      streakVal: null,
      payoutVal: null,
      diffVal: null,
      modeTag: null,
      graphBtn: null,
      modalOverlay: null,
      canvas: null,
      historyList: null
    };

    if (this.container) {
      this.mount(this.container);
    }
  }

  /**
   * Mount DataCounter into target DOM element
   */
  mount(container) {
    this.container = container;
    this.render();
    this.createGraphModal();
  }

  /**
   * Render the digital header data counter board
   */
  render() {
    const root = document.createElement('div');
    root.className = 'data-counter-board';
    root.innerHTML = `
      <div class="data-cell">
        <span class="data-cell-label">回転数</span>
        <span class="data-cell-value" data-field="spins">000</span>
      </div>
      <div class="data-cell">
        <span class="data-cell-label">大当り (BB)</span>
        <span class="data-cell-value highlight-red" data-field="bb">0</span>
      </div>
      <div class="data-cell">
        <span class="data-cell-label">突入 (RB)</span>
        <span class="data-cell-value highlight-cyan" data-field="rb">0</span>
      </div>
      <div class="data-cell">
        <span class="data-cell-label">連チャン</span>
        <span class="data-cell-value highlight-yellow" data-field="streak">0</span>
      </div>
      <div class="data-cell">
        <span class="data-cell-label">獲得出玉</span>
        <span class="data-cell-value" data-field="payout">0</span>
      </div>
      <div class="data-cell">
        <span class="data-cell-label">差玉</span>
        <span class="data-cell-value highlight-cyan" data-field="diff">+0</span>
      </div>
      <button class="data-graph-btn" type="button" title="スランプグラフ表示">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        <span>グラフ</span>
      </button>
    `;

    this.dom.root = root;
    this.dom.spinsVal = root.querySelector('[data-field="spins"]');
    this.dom.bbVal = root.querySelector('[data-field="bb"]');
    this.dom.rbVal = root.querySelector('[data-field="rb"]');
    this.dom.streakVal = root.querySelector('[data-field="streak"]');
    this.dom.payoutVal = root.querySelector('[data-field="payout"]');
    this.dom.diffVal = root.querySelector('[data-field="diff"]');
    this.dom.graphBtn = root.querySelector('.data-graph-btn');

    this.dom.graphBtn.addEventListener('click', () => {
      this.toggleGraphModal();
    });

    this.container.appendChild(root);
    return root;
  }

  /**
   * Create slump graph modal dialog
   */
  createGraphModal() {
    const overlay = document.createElement('div');
    overlay.className = 'cabinet-modal-overlay';
    overlay.innerHTML = `
      <div class="cabinet-modal-card" style="max-width: 680px;">
        <div class="modal-header">
          <div class="modal-title">
            <span>リアルタイム スランプグラフ</span>
            <span class="modal-title-badge">DATA COUNTER</span>
          </div>
          <button class="modal-close-btn" type="button">&times;</button>
        </div>
        <div class="modal-body">
          <div class="slump-graph-container">
            <canvas class="slump-canvas" width="640" height="240"></canvas>
          </div>
          <div style="font-size: 12px; font-weight: bold; color: #8c97ad; margin-top: 6px;">大当り履歴 (直近10件)</div>
          <div class="history-list"></div>
        </div>
      </div>
    `;

    const closeBtn = overlay.querySelector('.modal-close-btn');
    closeBtn.addEventListener('click', () => this.hideGraphModal());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideGraphModal();
    });

    this.dom.modalOverlay = overlay;
    this.dom.canvas = overlay.querySelector('.slump-canvas');
    this.dom.historyList = overlay.querySelector('.history-list');

    document.body.appendChild(overlay);
  }

  /**
   * Update stats from outside (e.g. from engine)
   */
  updateData(data = {}) {
    if (data.spins !== undefined) this.spins = data.spins;
    if (data.bb !== undefined) this.bbCount = data.bb;
    if (data.rb !== undefined) this.rbCount = data.rb;
    if (data.streak !== undefined) {
      this.currentStreak = data.streak;
      if (this.currentStreak > this.maxStreak) this.maxStreak = this.currentStreak;
    }
    if (data.totalPayout !== undefined) this.totalPayout = data.totalPayout;
    if (data.ballDiff !== undefined) this.ballDiff = data.ballDiff;
    if (data.mode !== undefined) this.mode = data.mode;

    this.refreshDisplay();
  }

  /**
   * Record a rotation (spin) and consumed balls
   */
  recordSpin(consumedBalls = 1) {
    this.spins++;
    this.totalSpins++;
    this.ballsShot += consumedBalls;
    this.ballDiff -= consumedBalls;

    // Record slump point every spin or batch
    this.slumpPoints.push({
      spin: this.totalSpins,
      diff: this.ballDiff,
      isBonus: false
    });

    this.refreshDisplay();
  }

  /**
   * Record a bonus winning event
   */
  recordBonus({ type = 'FEVER', spins = this.spins, balls = 1500, streak = this.currentStreak + 1, mode = 'BONUS' }) {
    if (type.includes('LT') || type.includes('HYPER') || balls >= 1500) {
      this.bbCount++;
    } else {
      this.rbCount++;
    }

    this.currentStreak = streak;
    if (this.currentStreak > this.maxStreak) this.maxStreak = this.currentStreak;

    this.totalPayout += balls;
    this.ballDiff += balls;

    const record = {
      id: this.history.length + 1,
      spins: spins,
      type: type,
      balls: balls,
      streak: this.currentStreak,
      time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    };

    this.history.unshift(record);
    if (this.history.length > 20) this.history.pop();

    this.slumpPoints.push({
      spin: this.totalSpins,
      diff: this.ballDiff,
      isBonus: true,
      bonusType: type
    });

    // Reset current spins after bonus
    this.spins = 0;

    this.refreshDisplay();
    this.updateHistoryList();
    this.drawSlumpGraph();
  }

  /**
   * Refresh DOM values
   */
  refreshDisplay() {
    if (!this.dom.root) return;

    this.dom.spinsVal.textContent = String(this.spins).padStart(3, '0');
    this.dom.bbVal.textContent = this.bbCount;
    this.dom.rbVal.textContent = this.rbCount;
    this.dom.streakVal.textContent = this.currentStreak;
    this.dom.payoutVal.textContent = this.totalPayout.toLocaleString();

    const diffPrefix = this.ballDiff >= 0 ? '+' : '';
    this.dom.diffVal.textContent = `${diffPrefix}${this.ballDiff.toLocaleString()}`;
    if (this.ballDiff > 0) {
      this.dom.diffVal.className = 'data-cell-value highlight-cyan';
    } else if (this.ballDiff < 0) {
      this.dom.diffVal.className = 'data-cell-value highlight-red';
    } else {
      this.dom.diffVal.className = 'data-cell-value highlight-yellow';
    }
  }

  /**
   * Render slump graph on canvas
   */
  drawSlumpGraph() {
    const canvas = this.dom.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 25, right: 30, bottom: 25, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Find min and max diff
    let minDiff = 0;
    let maxDiff = 0;
    let maxSpin = Math.max(100, this.totalSpins);

    for (const p of this.slumpPoints) {
      if (p.diff < minDiff) minDiff = p.diff;
      if (p.diff > maxDiff) maxDiff = p.diff;
    }

    // Add margin to diff range
    const absMax = Math.max(5000, Math.abs(minDiff), Math.abs(maxDiff));
    const rangeY = Math.ceil(absMax / 2500) * 2500;
    const yTop = rangeY;
    const yBottom = -rangeY;

    // Draw horizontal grid lines & 0 baseline
    ctx.lineWidth = 1;
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const val = yBottom + (rangeY * 2 / gridSteps) * i;
      const y = padding.top + chartH - ((val - yBottom) / (rangeY * 2)) * chartH;

      ctx.beginPath();
      if (val === 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
      }
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      // Label
      ctx.font = '10px monospace';
      ctx.fillStyle = val === 0 ? '#ffffff' : (val > 0 ? '#00e5ff' : '#ff4d6d');
      ctx.textAlign = 'right';
      ctx.fillText((val >= 0 ? '+' : '') + val, padding.left - 6, y + 3);
    }

    if (this.slumpPoints.length < 2) return;

    // Helper functions for coordinate mapping
    const getX = (spin) => padding.left + (spin / maxSpin) * chartW;
    const getY = (diff) => padding.top + chartH - ((diff - yBottom) / (rangeY * 2)) * chartH;
    const zeroY = getY(0);

    // Draw graph line
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.ballDiff >= 0 ? '#00ff88' : '#ff3366';

    const firstPt = this.slumpPoints[0];
    ctx.moveTo(getX(firstPt.spin), getY(firstPt.diff));

    for (let i = 1; i < this.slumpPoints.length; i++) {
      const pt = this.slumpPoints[i];
      ctx.lineTo(getX(pt.spin), getY(pt.diff));
    }
    ctx.stroke();

    // Draw bonus markers
    for (const pt of this.slumpPoints) {
      if (pt.isBonus) {
        const bx = getX(pt.spin);
        const by = getY(pt.diff);

        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ffea00';
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Title / Current status
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#8c97ad';
    ctx.textAlign = 'left';
    ctx.fillText(`TOTAL: ${this.totalSpins}G / MAX: ${this.maxStreak}連 / 差玉: ${(this.ballDiff >= 0 ? '+' : '') + this.ballDiff}`, padding.left, padding.top - 8);
  }

  /**
   * Update bonus history list in modal
   */
  updateHistoryList() {
    if (!this.dom.historyList) return;
    this.dom.historyList.innerHTML = '';

    if (this.history.length === 0) {
      this.dom.historyList.innerHTML = `<div style="text-align: center; color: #555; padding: 10px;">大当りデータなし</div>`;
      return;
    }

    this.history.forEach((h, idx) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      const isBB = h.type.includes('BB') || h.type.includes('FEVER') || h.balls >= 1500;
      row.innerHTML = `
        <span class="history-col-idx">#${h.id}</span>
        <span class="history-col-type ${isBB ? 'bb' : 'rb'}">${h.type} (${h.streak}連)</span>
        <span class="history-col-spins">${h.spins}G</span>
        <span class="history-col-balls">+${h.balls.toLocaleString()}発</span>
      `;
      this.dom.historyList.appendChild(row);
    });
  }

  /**
   * Toggle slump graph modal
   */
  toggleGraphModal() {
    if (!this.dom.modalOverlay) return;
    if (this.dom.modalOverlay.classList.contains('open')) {
      this.hideGraphModal();
    } else {
      this.showGraphModal();
    }
  }

  showGraphModal() {
    if (!this.dom.modalOverlay) return;
    this.dom.modalOverlay.classList.add('open');
    this.updateHistoryList();
    this.drawSlumpGraph();
    if (this.onToggleModal) this.onToggleModal(true);
  }

  hideGraphModal() {
    if (!this.dom.modalOverlay) return;
    this.dom.modalOverlay.classList.remove('open');
    if (this.onToggleModal) this.onToggleModal(false);
  }

  /**
   * Reset all data counter statistics
   */
  reset() {
    this.spins = 0;
    this.totalSpins = 0;
    this.bbCount = 0;
    this.rbCount = 0;
    this.currentStreak = 0;
    this.maxStreak = 0;
    this.totalPayout = 0;
    this.ballsShot = 0;
    this.ballDiff = 0;
    this.mode = 'NORMAL';
    this.slumpPoints = [{ spin: 0, diff: 0, isBonus: false }];
    this.history = [];
    this.refreshDisplay();
    this.updateHistoryList();
    this.drawSlumpGraph();
  }
}
