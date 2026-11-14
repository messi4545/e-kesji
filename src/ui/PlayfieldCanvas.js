/**
 * PlayfieldCanvas.js
 * Authentic 2D Pachinko Ball Physics & Articulated Mechanical Gimmick (役物) Engine
 * for 'e けすじー 〜超進化覚醒〜'
 *
 * Features:
 * 1. Real 60fps metallic pachinko ball physics on the 1200x896 cabinet coordinate space:
 *    - Left-hand shooting rail -> Nail forest (釘の森) -> Windmills (風車) -> Warp / Under-LCD Stage (ステージ) -> Heso (ヘソ)
 *    - Right-hand shooting (右打ち) -> Right speed lane -> Denchu (電チュー) & Big Bonus Attacker (大当りアタッカー)
 *    - Physical ball entry directly triggers game engine Heso / Denchu / Attacker events!
 * 2. Articulated Cyborg Kesji & Logo Gimmicks (可動役物):
 *    - Cuts out and animates the actual Cyborg Kesji head, torso, left/right mechanical arms, golden gears, and top 'e けすじー' logo from sozai/eけすじー筐体.jpg.
 *    - Supports states: 'idle', 'sakiyomi' (red eye laser + shudder), 'pseudo2', 'pseudo3', 'climax_drop' (full gadget drop over LCD!), 'fever' (rainbow rave).
 */

export class PlayfieldCanvas {
  constructor(options = {}) {
    this.container = options.container || null;
    this.imageSrc = options.imageSrc || 'sozai/eけすじー筐体.jpg';

    // Callbacks triggered when a physical ball enters a pocket
    this.onHesoEnter = options.onHesoEnter || null;
    this.onDenchuEnter = options.onDenchuEnter || null;
    this.onAttackerEnter = options.onAttackerEnter || null;
    this.onNailHit = options.onNailHit || null;

    // Coordinate space matches eけすじー筐体.jpg (1200 x 896)
    this.width = 1200;
    this.height = 896;

    // LCD Rectangle in 1200x896 space
    this.lcdRect = { x: 466, y: 410, w: 281, h: 192 };

    // Pocket Coordinates
    this.hesoPos = { x: 604, y: 714, r: 16 };
    this.denchuPos = { x: 782, y: 652, r: 18 };
    this.attackerPos = { x: 604, y: 758, w: 76, h: 22 };
    this.warpLeftPos = { x: 448, y: 558, r: 13 };

    // Game mode flags affecting playfield gates
    this.gameMode = 'NORMAL'; // 'NORMAL' | 'RUSH_LOW' | 'RUSH_HIGH_LT' | 'BONUS'
    this.denchuOpen = false;
    this.attackerOpen = false;

    // Physics entities
    this.balls = [];
    this.sparks = [];
    this.popups = [];
    this.nails = [];
    this.windmills = [];
    this.bumpers = [];

    // Gimmick state ('idle' | 'sakiyomi' | 'pseudo2' | 'pseudo3' | 'climax_drop' | 'fever')
    this.gimmickState = 'idle';
    this.gimmickTimer = null;
    this.gimmickAnimProgress = 0; // 0 (retracted) -> 1 (fully dropped)
    this.targetGimmickDrop = 0;
    this.gearAngle = 0;
    this.startTime = performance.now();

    // Image reference
    this.cabinetImage = null;
    this.imageLoaded = false;

    // DOM Canvases:
    // 1. bgCanvas (z-index: 15): draws mechanical recess, rotating gears, and pachinko balls
    // 2. fgCanvas (z-index: 28): draws articulated Cyborg Kesji head/arms/logo & lightning over the LCD
    this.bgCanvas = null;
    this.bgCtx = null;
    this.fgCanvas = null;
    this.fgCtx = null;

    this._rafId = null;

    this._initNailsAndObstacles();
    if (this.container) {
      this.mount(this.container);
    }
  }

  /**
   * Setup realistic nail positions matching eけすじー筐体.jpg
   */
  _initNailsAndObstacles() {
    this.nails = [];

    // 1. Left forest upper & middle nails
    const leftNails = [
      // Upper left entry cluster
      { x: 395, y: 350 }, { x: 418, y: 365 }, { x: 378, y: 378 },
      { x: 402, y: 392 }, { x: 428, y: 382 }, { x: 365, y: 408 },
      { x: 390, y: 420 }, { x: 415, y: 412 }, { x: 355, y: 440 },
      { x: 380, y: 452 }, { x: 406, y: 445 }, { x: 430, y: 438 },
      // Mid-left cluster
      { x: 352, y: 475 }, { x: 376, y: 488 }, { x: 402, y: 482 },
      { x: 426, y: 475 }, { x: 358, y: 512 }, { x: 384, y: 525 },
      { x: 410, y: 518 }, { x: 432, y: 512 }, { x: 366, y: 548 },
      { x: 394, y: 560 }, { x: 420, y: 552 },
      // Diagonal guide chute toward Heso (visible in photo!)
      { x: 418, y: 594 }, { x: 436, y: 606 }, { x: 455, y: 618 },
      { x: 475, y: 630 }, { x: 496, y: 642 }, { x: 518, y: 653 },
      { x: 540, y: 664 }, { x: 562, y: 674 },
      // Lower parallel rail of diagonal chute
      { x: 396, y: 616 }, { x: 415, y: 630 }, { x: 435, y: 644 },
      { x: 456, y: 658 }, { x: 478, y: 671 }, { x: 500, y: 684 },
      { x: 524, y: 696 }, { x: 548, y: 706 },
      // Heso life nails (命釘 - pair right above Heso)
      { x: 589, y: 693, isLifeNail: true },
      { x: 619, y: 693, isLifeNail: true },
      // Nails flanking Heso
      { x: 572, y: 705 }, { x: 636, y: 705 },

      // Right side nails (Right-hand shooting lane for RUSH / BONUS)
      { x: 825, y: 365 }, { x: 848, y: 385 }, { x: 818, y: 405 },
      { x: 845, y: 428 }, { x: 865, y: 452 }, { x: 832, y: 468 },
      { x: 858, y: 495 }, { x: 830, y: 520 }, { x: 855, y: 548 },
      { x: 825, y: 575 }, { x: 848, y: 602 }, { x: 815, y: 625 },
      // Right diagonal guide toward Denchu & Attacker
      { x: 758, y: 628 }, { x: 806, y: 635 },
      { x: 755, y: 676 }, { x: 732, y: 690 }, { x: 706, y: 704 },
      { x: 680, y: 718 }, { x: 655, y: 730 }
    ];

    this.nails = leftNails.map(n => ({
      x: n.x,
      y: n.y,
      r: n.isLifeNail ? 4.5 : 4.0,
      isLifeNail: !!n.isLifeNail,
      hitFlash: 0
    }));

    // 2. Rotating Windmills (風車)
    this.windmills = [
      { x: 392, y: 502, r: 16, angle: 0, speed: 0.05 },
      { x: 435, y: 575, r: 15, angle: 1.2, speed: -0.05 },
      { x: 832, y: 498, r: 15, angle: 0.5, speed: 0.06 }
    ];
  }

  /**
   * Mount dual canvases into the cabinet machine container
   */
  mount(container) {
    this.container = container;
    if (!this.container) return;

    // 1. Playfield & Balls Canvas (sits above background photo, around/under Gimmick)
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = this.width;
    this.bgCanvas.height = this.height;
    this.bgCanvas.className = 'playfield-balls-canvas';
    this.bgCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 22;
    `;
    this.bgCtx = this.bgCanvas.getContext('2d');

    // 2. Foreground Articulated Gimmick Canvas (sits ABOVE LCD so dropping Cyborg overlaps LCD!)
    this.fgCanvas = document.createElement('canvas');
    this.fgCanvas.width = this.width;
    this.fgCanvas.height = this.height;
    this.fgCanvas.className = 'playfield-gimmick-canvas';
    this.fgCanvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 28;
    `;
    this.fgCtx = this.fgCanvas.getContext('2d');

    this.container.appendChild(this.bgCanvas);
    this.container.appendChild(this.fgCanvas);

    // Load cabinet image for real-photo gimmick cutouts
    this.cabinetImage = new Image();
    this.cabinetImage.onload = () => {
      this.imageLoaded = true;
    };
    this.cabinetImage.src = this.imageSrc;

    this.startLoop();
  }

  /**
   * Update game state so Denchu / Attacker gates open & close realistically
   */
  setGameMode(mode) {
    this.gameMode = mode;
    if (mode === 'RUSH_LOW' || mode === 'RUSH_HIGH_LT') {
      this.denchuOpen = true;
      this.attackerOpen = false;
    } else if (mode === 'BONUS') {
      this.denchuOpen = false;
      this.attackerOpen = true;
    } else {
      this.denchuOpen = false;
      this.attackerOpen = false;
    }
  }

  /**
   * Trigger mechanical gimmick animation state
   * @param {'idle'|'sakiyomi'|'pseudo2'|'pseudo3'|'climax_drop'|'fever'} state
   * @param {number} durationMs
   */
  triggerGimmick(state = 'climax_drop', durationMs = 3500) {
    if (this.gimmickTimer) {
      clearTimeout(this.gimmickTimer);
      this.gimmickTimer = null;
    }

    this.gimmickState = state;

    switch (state) {
      case 'climax_drop':
        this.targetGimmickDrop = 1.0;
        this._spawnGimmickSparks(604, 420, 35, '#ffea00');
        break;
      case 'pseudo3':
        this.targetGimmickDrop = 0.65;
        this._spawnGimmickSparks(604, 390, 22, '#ff1744');
        break;
      case 'pseudo2':
        this.targetGimmickDrop = 0.32;
        this._spawnGimmickSparks(604, 360, 12, '#00e5ff');
        break;
      case 'sakiyomi':
        this.targetGimmickDrop = 0.22;
        this._spawnGimmickSparks(775, 290, 18, '#ff0044');
        break;
      case 'fever':
        this.targetGimmickDrop = 0.75;
        this._spawnGimmickSparks(604, 410, 40, '#00ffcc');
        break;
      case 'idle':
      default:
        this.targetGimmickDrop = 0;
        break;
    }

    if (durationMs > 0 && state !== 'idle') {
      this.gimmickTimer = setTimeout(() => {
        this.gimmickState = 'idle';
        this.targetGimmickDrop = 0;
      }, durationMs);
    }
  }

  /**
   * Spawn a physical pachinko ball from the launcher rail
   * @param {number} power - 0..100 handle power
   */
  launchBall(power = 55) {
    // Auto-adjust power if in RUSH or BONUS so player's auto-fire naturally hits right lane if power >= 50
    let effectivePower = power;
    if ((this.gameMode === 'RUSH_LOW' || this.gameMode === 'RUSH_HIGH_LT' || this.gameMode === 'BONUS') && power >= 50 && power <= 75) {
      effectivePower = 85; // Auto right-fire assist during RUSH/BONUS!
    }

    const isRight = effectivePower > 75;

    // Ball starts on the left outer rail and rides the arc up quickly
    this.balls.push({
      id: Math.random(),
      state: 'rail', // 'rail' | 'playfield' | 'stage' | 'sinking'
      railAngle: Math.PI * 0.88, // bottom-left of arc
      railTargetAngle: isRight ? Math.PI * 1.78 : Math.PI * 1.24 + (Math.random() * 0.08 - 0.04),
      railSpeed: isRight ? 0.095 : 0.075,
      isRightAim: isRight,
      x: 340,
      y: 640,
      vx: 0,
      vy: 0,
      r: 8.5,
      trail: [],
      stageTime: 0,
      alpha: 1,
      sinkTimer: 0
    });
  }

  startLoop() {
    const tick = (now) => {
      this._update(now);
      this._render(now);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _spawnGimmickSparks(x, y, count = 15, color = '#00e5ff') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.025 + Math.random() * 0.03,
        color,
        size: 2.5 + Math.random() * 3.5
      });
    }
  }

  _addPopup(x, y, text, color = '#ffea00') {
    this.popups.push({
      x,
      y,
      text,
      color,
      life: 1.0
    });
  }

  /**
   * Physics & Gimmick State Update
   */
  _update(now) {
    // 1. Update Gimmick drop interpolation
    const diff = this.targetGimmickDrop - this.gimmickAnimProgress;
    // Fast slam down, smooth retract
    const lerpSpeed = diff > 0 ? 0.16 : 0.08;
    this.gimmickAnimProgress += diff * lerpSpeed;

    // Gear rotation speed
    const gearMultiplier = this.gimmickState === 'idle' ? 1 : (this.gimmickState === 'climax_drop' || this.gimmickState === 'fever' ? 6 : 3);
    this.gearAngle += 0.02 * gearMultiplier;

    // 2. Update Windmills
    for (const wm of this.windmills) {
      wm.angle += wm.speed;
    }

    // 3. Update Nails flash decay
    for (const n of this.nails) {
      if (n.hitFlash > 0) n.hitFlash = Math.max(0, n.hitFlash - 0.08);
    }

    // 4. Update Pachinko Balls
    const gravity = 0.26;
    const center = { x: 604, y: 492, radius: 268 };

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];

      // Save short motion trail
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 5) b.trail.shift();

      if (b.state === 'sinking') {
        b.sinkTimer += 0.12;
        b.alpha = Math.max(0, 1 - b.sinkTimer);
        b.r = Math.max(2, 8.5 * (1 - b.sinkTimer * 0.5));
        if (b.sinkTimer >= 1) {
          this.balls.splice(i, 1);
        }
        continue;
      }

      // STATE A: Riding the outer launch rail
      if (b.state === 'rail') {
        b.railAngle += b.railSpeed;
        const railR = 274;
        b.x = center.x + Math.cos(b.railAngle) * railR;
        b.y = center.y + Math.sin(b.railAngle) * railR;

        if (b.railAngle >= b.railTargetAngle) {
          b.state = 'playfield';
          if (b.isRightAim) {
            // Eject into right-hand RUSH/BONUS lane
            b.vx = 1.5 + Math.random() * 1.5;
            b.vy = 2.0 + Math.random() * 1.2;
          } else {
            // Eject into left-hand nail forest
            b.vx = 1.8 + Math.random() * 1.8;
            b.vy = 1.0 + Math.random() * 1.2;
          }
        }
        continue;
      }

      // STATE B: Rolling on the under-LCD Stage (ステージ)
      if (b.state === 'stage') {
        b.stageTime += 0.07;
        // Harmonic oscillation toward center groove (x = 604)
        const targetX = 604;
        const dx = targetX - b.x;
        b.vx = b.vx * 0.92 + dx * 0.035;
        b.x += b.vx;
        b.y = 622 + Math.sin(b.stageTime * 3) * 2;

        // Drop from center groove into Heso path!
        if (Math.abs(b.x - 604) < 12 && b.stageTime > 1.1) {
          b.state = 'playfield';
          b.x = 604 + (Math.random() * 4 - 2);
          b.y = 638;
          b.vx = (Math.random() - 0.5) * 0.6;
          b.vy = 2.2;
          this._spawnGimmickSparks(b.x, b.y, 6, '#00e5ff');
        }
        continue;
      }

      // STATE C: Free Playfield Physics
      b.vy += gravity;

      // Subtle guide force toward center-bottom when in lower chute
      if (!b.isRightAim && b.y > 570 && b.x < 575) {
        b.vx += 0.12;
      }
      if (b.isRightAim && b.y > 580 && b.x > 640) {
        b.vx -= 0.14;
      }

      b.x += b.vx;
      b.y += b.vy;

      // Damping
      b.vx *= 0.992;
      b.vy *= 0.992;

      // Keep outside the central LCD box (balls flow around the LCD bezel, not through it!)
      const pad = b.r + 4;
      const lcdLeft = this.lcdRect.x - pad;
      const lcdRight = this.lcdRect.x + this.lcdRect.w + pad;
      const lcdTop = this.lcdRect.y - pad;
      const lcdBottom = this.lcdRect.y + this.lcdRect.h + pad;

      if (b.x > lcdLeft && b.x < lcdRight && b.y > lcdTop && b.y < lcdBottom) {
        // Push out to nearest side
        const distLeft = Math.abs(b.x - lcdLeft);
        const distRight = Math.abs(lcdRight - b.x);
        const distTop = Math.abs(b.y - lcdTop);
        const distBottom = Math.abs(lcdBottom - b.y);
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        if (minDist === distLeft) {
          b.x = lcdLeft;
          b.vx = -Math.abs(b.vx) * 0.6 - 0.8;
        } else if (minDist === distRight) {
          b.x = lcdRight;
          b.vx = Math.abs(b.vx) * 0.6 + 0.8;
        } else if (minDist === distTop) {
          b.y = lcdTop;
          b.vy = -Math.abs(b.vy) * 0.5;
          b.vx += b.x < 604 ? -1.5 : 1.5;
        } else {
          b.y = lcdBottom;
          b.vy = Math.abs(b.vy) * 0.5;
        }
      }

      // Outer circular glass wall boundary
      const dxCenter = b.x - center.x;
      const dyCenter = b.y - center.y;
      const distCenter = Math.hypot(dxCenter, dyCenter);
      if (distCenter > center.radius - b.r && b.y < 735) {
        const nx = dxCenter / distCenter;
        const ny = dyCenter / distCenter;
        b.x = center.x + nx * (center.radius - b.r);
        b.y = center.y + ny * (center.radius - b.r);
        const dot = b.vx * nx + b.vy * ny;
        b.vx = (b.vx - 1.5 * dot * nx) * 0.75;
        b.vy = (b.vy - 1.5 * dot * ny) * 0.75;
      }

      // Collision with Nails
      for (const n of this.nails) {
        const dx = b.x - n.x;
        const dy = b.y - n.y;
        const dist = Math.hypot(dx, dy);
        const minDist = b.r + n.r;
        if (dist < minDist && dist > 0.001) {
          const nx = dx / dist;
          const ny = dy / dist;
          b.x = n.x + nx * minDist;
          b.y = n.y + ny * minDist;
          const speed = Math.hypot(b.vx, b.vy);
          const bounce = 0.62;
          // Add slight random jitter like real brass nails
          const jitter = (Math.random() - 0.5) * 1.1;
          b.vx = nx * speed * bounce + jitter;
          b.vy = ny * speed * bounce;
          n.hitFlash = 1.0;
        }
      }

      // Collision with Windmills
      for (const wm of this.windmills) {
        const dx = b.x - wm.x;
        const dy = b.y - wm.y;
        const dist = Math.hypot(dx, dy);
        if (dist < b.r + wm.r) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          b.x = wm.x + nx * (b.r + wm.r);
          b.y = wm.y + ny * (b.r + wm.r);
          wm.speed = (b.x > wm.x ? 0.12 : -0.12);
          b.vx = nx * 2.5 + (Math.random() - 0.5);
          b.vy = -1.2;
        }
      }

      // Check Warp Entrance (Left of LCD -> teleports to Stage!)
      if (Math.hypot(b.x - this.warpLeftPos.x, b.y - this.warpLeftPos.y) < this.warpLeftPos.r + 4) {
        b.state = 'stage';
        b.x = 515;
        b.y = 622;
        b.vx = 3.2;
        b.vy = 0;
        b.stageTime = 0;
        this._spawnGimmickSparks(this.warpLeftPos.x, this.warpLeftPos.y, 8, '#00e5ff');
        this._addPopup(this.warpLeftPos.x, this.warpLeftPos.y - 10, 'WARP!', '#00e5ff');
        continue;
      }

      // Check Pocket 1: HESO (Start Chucker / 特図1)
      const distHeso = Math.hypot(b.x - this.hesoPos.x, b.y - this.hesoPos.y);
      if (distHeso < this.hesoPos.r) {
        b.state = 'sinking';
        b.x = this.hesoPos.x;
        b.y = this.hesoPos.y;
        this._spawnGimmickSparks(this.hesoPos.x, this.hesoPos.y, 18, '#ff1744');
        this._addPopup(this.hesoPos.x, this.hesoPos.y - 18, 'IN!! +3', '#00ff88');
        if (this.onHesoEnter) this.onHesoEnter();
        continue;
      }

      // Check Pocket 2: DENCHU (Right Chucker / 特図2)
      const denchuRadius = this.denchuOpen ? this.denchuPos.r + 10 : this.denchuPos.r * 0.45;
      const distDenchu = Math.hypot(b.x - this.denchuPos.x, b.y - this.denchuPos.y);
      if (distDenchu < denchuRadius && (this.denchuOpen || Math.random() < 0.15)) {
        b.state = 'sinking';
        b.x = this.denchuPos.x;
        b.y = this.denchuPos.y;
        this._spawnGimmickSparks(this.denchuPos.x, this.denchuPos.y, 20, '#00e5ff');
        this._addPopup(this.denchuPos.x, this.denchuPos.y - 18, '電チュー IN!!', '#00e5ff');
        if (this.onDenchuEnter) this.onDenchuEnter();
        continue;
      }

      // Check Pocket 3: BIG BONUS ATTACKER (大当りアタッカー)
      if (this.attackerOpen) {
        if (
          b.x > this.attackerPos.x - this.attackerPos.w / 2 &&
          b.x < this.attackerPos.x + this.attackerPos.w / 2 &&
          b.y > this.attackerPos.y - 14 &&
          b.y < this.attackerPos.y + 18
        ) {
          b.state = 'sinking';
          b.x = this.attackerPos.x;
          b.y = this.attackerPos.y;
          this._spawnGimmickSparks(this.attackerPos.x, this.attackerPos.y, 24, '#ffd700');
          this._addPopup(this.attackerPos.x, this.attackerPos.y - 20, 'ATTACKER +15!!', '#ffd700');
          if (this.onAttackerEnter) this.onAttackerEnter();
          continue;
        }
      }

      // Bottom out-hole removal
      if (b.y > 768) {
        b.state = 'sinking';
      }
    }

    // 5. Update Sparks & Popups
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.12;
      s.life -= s.decay;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y -= 1.2;
      p.life -= 0.028;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
  }

  /**
   * Render Playfield Balls, Active Chucker Gates, and Articulated Gimmicks
   */
  _render(now) {
    if (!this.bgCtx || !this.fgCtx) return;

    const bg = this.bgCtx;
    const fg = this.fgCtx;

    bg.clearRect(0, 0, this.width, this.height);
    fg.clearRect(0, 0, this.width, this.height);

    const t = (now - this.startTime) * 0.001;

    // =========================================================================
    // LAYER 1 (bgCtx): Playfield Pins, Windmills, Chucker Gates, and Silver Balls
    // =========================================================================

    // 1A. Draw Under-LCD Stage groove glow
    bg.save();
    const stageGrad = bg.createLinearGradient(490, 622, 715, 622);
    stageGrad.addColorStop(0, 'rgba(0, 229, 255, 0.15)');
    stageGrad.addColorStop(0.5, 'rgba(255, 230, 0, 0.55)');
    stageGrad.addColorStop(1, 'rgba(0, 229, 255, 0.15)');
    bg.strokeStyle = stageGrad;
    bg.lineWidth = 4;
    bg.beginPath();
    bg.moveTo(495, 618);
    bg.quadraticCurveTo(604, 634, 712, 618);
    bg.stroke();
    bg.restore();

    // 1B. Draw Heso Chucker Ring & Target Glow
    bg.save();
    const hesoPulse = 0.6 + 0.4 * Math.sin(t * 5);
    bg.beginPath();
    bg.arc(this.hesoPos.x, this.hesoPos.y, this.hesoPos.r + 3, 0, Math.PI * 2);
    bg.fillStyle = `rgba(255, 23, 68, ${0.25 * hesoPulse})`;
    bg.fill();
    bg.lineWidth = 2.5;
    bg.strokeStyle = '#ff3366';
    bg.stroke();
    // Label above Heso
    bg.font = '900 12px sans-serif';
    bg.fillStyle = '#ffffff';
    bg.textAlign = 'center';
    bg.shadowColor = '#ff0055';
    bg.shadowBlur = 6;
    bg.fillText('START', this.hesoPos.x, this.hesoPos.y - 22);
    bg.restore();

    // 1C. Draw Denchu Gate (Right-hand RUSH Chucker)
    bg.save();
    const denchuGlow = this.denchuOpen ? (0.7 + 0.3 * Math.sin(t * 10)) : 0.25;
    bg.beginPath();
    bg.arc(this.denchuPos.x, this.denchuPos.y, this.denchuPos.r, 0, Math.PI * 2);
    bg.fillStyle = this.denchuOpen ? `rgba(0, 229, 255, ${0.45 * denchuGlow})` : 'rgba(0, 0, 0, 0.4)';
    bg.fill();
    bg.lineWidth = 2.5;
    bg.strokeStyle = this.denchuOpen ? '#00ffcc' : '#446688';
    bg.stroke();

    // Draw animated Denchu wings (電動チューリップ羽根)
    const wingAngle = this.denchuOpen ? 0.55 : 0.08;
    bg.strokeStyle = '#00f0ff';
    bg.lineWidth = 4;
    bg.beginPath();
    bg.moveTo(this.denchuPos.x - 14, this.denchuPos.y + 8);
    bg.lineTo(this.denchuPos.x - 14 - Math.sin(wingAngle) * 18, this.denchuPos.y - 12);
    bg.moveTo(this.denchuPos.x + 14, this.denchuPos.y + 8);
    bg.lineTo(this.denchuPos.x + 14 + Math.sin(wingAngle) * 18, this.denchuPos.y - 12);
    bg.stroke();

    if (this.denchuOpen) {
      bg.font = '900 13px sans-serif';
      bg.fillStyle = '#00ffcc';
      bg.textAlign = 'center';
      bg.shadowColor = '#000';
      bg.shadowBlur = 4;
      bg.fillText('▶電チューOPEN◀', this.denchuPos.x, this.denchuPos.y - 22);
    }
    bg.restore();

    // 1D. Draw Big Bonus Attacker Gate
    if (this.attackerOpen) {
      bg.save();
      bg.fillStyle = 'rgba(255, 215, 0, 0.45)';
      bg.strokeStyle = '#ffea00';
      bg.lineWidth = 3;
      bg.beginPath();
      bg.roundRect(
        this.attackerPos.x - this.attackerPos.w / 2,
        this.attackerPos.y - this.attackerPos.h / 2,
        this.attackerPos.w,
        this.attackerPos.h,
        6
      );
      bg.fill();
      bg.stroke();
      bg.font = '900 14px sans-serif';
      bg.fillStyle = '#ffea00';
      bg.textAlign = 'center';
      bg.shadowColor = '#ff0000';
      bg.shadowBlur = 8;
      bg.fillText('🔥 ATTACKER OPEN 🔥', this.attackerPos.x, this.attackerPos.y + 5);
      bg.restore();
    }

    // 1E. Draw Golden Brass Nails
    for (const n of this.nails) {
      bg.save();
      bg.beginPath();
      bg.arc(n.x, n.y, n.r + (n.hitFlash * 2.5), 0, Math.PI * 2);
      if (n.hitFlash > 0.1) {
        bg.fillStyle = '#ffffff';
        bg.shadowColor = '#00e5ff';
        bg.shadowBlur = 10;
      } else {
        bg.fillStyle = n.isLifeNail ? '#ffea00' : '#f5c542';
      }
      bg.fill();
      bg.lineWidth = 1;
      bg.strokeStyle = '#5c3c00';
      bg.stroke();
      bg.restore();
    }

    // 1F. Draw Rotating Windmills (風車)
    for (const wm of this.windmills) {
      bg.save();
      bg.translate(wm.x, wm.y);
      bg.rotate(wm.angle);
      for (let b = 0; b < 6; b++) {
        bg.rotate(Math.PI / 3);
        bg.fillStyle = b % 2 === 0 ? '#ff1744' : '#ffffff';
        bg.beginPath();
        bg.moveTo(0, 0);
        bg.lineTo(wm.r, -4);
        bg.lineTo(wm.r, 4);
        bg.closePath();
        bg.fill();
      }
      bg.beginPath();
      bg.arc(0, 0, 4, 0, Math.PI * 2);
      bg.fillStyle = '#ffd700';
      bg.fill();
      bg.restore();
    }

    // 1G. Draw Realistic Metallic Pachinko Silver Balls (銀玉)
    for (const b of this.balls) {
      bg.save();
      bg.globalAlpha = b.alpha;

      // Motion trail
      if (b.trail.length > 1) {
        bg.beginPath();
        bg.moveTo(b.trail[0].x, b.trail[0].y);
        for (let k = 1; k < b.trail.length; k++) {
          bg.lineTo(b.trail[k].x, b.trail[k].y);
        }
        bg.strokeStyle = b.isRightAim ? 'rgba(255, 215, 0, 0.35)' : 'rgba(180, 230, 255, 0.3)';
        bg.lineWidth = b.r * 1.1;
        bg.lineCap = 'round';
        bg.stroke();
      }

      // Drop shadow
      bg.beginPath();
      bg.arc(b.x + 2, b.y + 3, b.r, 0, Math.PI * 2);
      bg.fillStyle = 'rgba(0, 0, 0, 0.55)';
      bg.fill();

      // Chrome Sphere Gradient
      const grad = bg.createRadialGradient(
        b.x - b.r * 0.35,
        b.y - b.r * 0.35,
        b.r * 0.1,
        b.x,
        b.y,
        b.r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, '#e8f0f8');
      grad.addColorStop(0.65, '#8a99ad');
      grad.addColorStop(0.9, '#2f3640');
      grad.addColorStop(1, '#cdd6e0');

      bg.beginPath();
      bg.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      bg.fillStyle = grad;
      bg.fill();

      // Specular highlight dot
      bg.beginPath();
      bg.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, Math.PI * 2);
      bg.fillStyle = '#ffffff';
      bg.fill();

      bg.restore();
    }

    // =========================================================================
    // LAYER 2 (fgCtx): Articulated Cyborg Kesji & Logo Gimmicks (可動役物)
    // =========================================================================
    this._renderArticulatedGimmicks(fg, t);

    // Render Sparks & Popups on Foreground
    for (const s of this.sparks) {
      fg.save();
      fg.globalAlpha = Math.max(0, s.life);
      fg.fillStyle = s.color;
      fg.shadowColor = s.color;
      fg.shadowBlur = 10;
      fg.beginPath();
      fg.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      fg.fill();
      fg.restore();
    }

    for (const p of this.popups) {
      fg.save();
      fg.globalAlpha = Math.max(0, p.life);
      fg.font = '900 18px "Impact", "Hiragino Sans", sans-serif';
      fg.fillStyle = p.color;
      fg.strokeStyle = '#000000';
      fg.lineWidth = 4;
      fg.textAlign = 'center';
      fg.strokeText(p.text, p.x, p.y);
      fg.fillText(p.text, p.x, p.y);
      fg.restore();
    }
  }

  /**
   * Draws the moving mechanical gears, Cyborg Kesji arms, torso, head, and Top Logo
   * using real photo cutouts from eけすじー筐体.jpg!
   */
  _renderArticulatedGimmicks(ctx, t) {
    if (!this.imageLoaded || !this.cabinetImage) return;

    const drop = this.gimmickAnimProgress; // 0.0 (idle) -> 1.0 (full climax drop over LCD)
    const isActive = this.gimmickState !== 'idle' || drop > 0.03;

    // Idle breathing & active vibration offsets
    const breatheY = Math.sin(t * 2.6) * (isActive ? 5 : 2.0);
    const breatheRot = Math.sin(t * 1.9) * (isActive ? 0.02 : 0.008);
    const shakeX = isActive ? (Math.random() - 0.5) * (6 + drop * 10) : 0;
    const shakeY = isActive ? (Math.random() - 0.5) * (6 + drop * 10) : 0;

    // 1. Always draw subtle spinning golden gear rings over the brass gear centers on the photo
    for (const g of [
      { x: 477, y: 361, r: 22, dir: 1.4 },
      { x: 544, y: 392, r: 16, dir: -1.8 },
      { x: 423, y: 400, r: 28, dir: 1.1 }
    ]) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(this.gearAngle * g.dir);
      ctx.strokeStyle = isActive ? '#ffea00' : 'rgba(255, 215, 0, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, g.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2. When Gimmick Drops (drop > 0.03):
    //    Draw dark mechanical inner bay + 3D metallic gears + Unified Cyborg Kesji Unit slamming down!
    if (drop > 0.03) {
      const recessAlpha = Math.min(1, drop * 2.2);

      // 2A. Dark Mechanical Bay behind the dropping Cyborg
      ctx.save();
      ctx.globalAlpha = recessAlpha;
      ctx.beginPath();
      ctx.moveTo(430, 275);
      ctx.lineTo(710, 255);
      ctx.lineTo(765, 150);
      ctx.lineTo(895, 195);
      ctx.lineTo(890, 410);
      ctx.lineTo(750, 406);
      ctx.lineTo(445, 406);
      ctx.closePath();

      const recessGrad = ctx.createRadialGradient(680, 310, 20, 680, 310, 260);
      recessGrad.addColorStop(0, '#1f140e');
      recessGrad.addColorStop(0.55, '#0e0907');
      recessGrad.addColorStop(1, '#040303');
      ctx.fillStyle = recessGrad;
      ctx.fill();

      // Clip inside mechanical bay so internal gears never spill outside the machine frame
      ctx.clip();
      this._drawMechanicalGear(ctx, 610, 315, 58, 12, this.gearAngle, '#d49b27');
      this._drawMechanicalGear(ctx, 765, 275, 68, 14, -this.gearAngle * 1.2, '#b87d14');
      this._drawMechanicalGear(ctx, 835, 355, 50, 12, this.gearAngle * 0.9, '#e6b84c');
      this._drawMechanicalGear(ctx, 505, 345, 44, 10, -this.gearAngle * 1.4, '#c58b1e');
      ctx.restore();

      // 2B. Top 'e けすじー' Neon Marquee Gimmick (tilts & drops on reach/climax)
      ctx.save();
      const logoDropY = drop * 32;
      const logoRot = Math.sin(t * 18) * 0.014;
      ctx.translate(604 + shakeX * 0.4, 105 + logoDropY);
      ctx.rotate(logoRot);
      ctx.translate(-604, -105);

      ctx.beginPath();
      ctx.moveTo(395, 10);
      ctx.lineTo(835, 10);
      ctx.lineTo(855, 155);
      ctx.lineTo(665, 192);
      ctx.lineTo(400, 192);
      ctx.closePath();
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 20;
      ctx.clip();
      ctx.drawImage(this.cabinetImage, 0, 0, this.width, this.height);
      ctx.restore();

      // 2C. Unified Cyborg Kesji Mechanical Unit (Head + Torso + Both Arms as one connected 3D sculpture)
      ctx.save();
      const unitPivot = { x: 675, y: 335 };
      const unitMoveX = -drop * 55 + shakeX * 1.2;
      const unitMoveY = drop * 118 + breatheY + shakeY * 1.2;
      const unitScale = 1 + drop * 0.14;
      const unitRot = -drop * 0.08 + breatheRot;

      ctx.translate(unitPivot.x + unitMoveX, unitPivot.y + unitMoveY);
      ctx.scale(unitScale, unitScale);
      ctx.rotate(unitRot);
      ctx.translate(-unitPivot.x, -unitPivot.y);

      // Connected contour tracing Left Arm -> Shoulders -> Giant Kesji Head -> Right Arm -> Chest Base
      const traceCyborgContour = () => {
        ctx.beginPath();
        ctx.moveTo(412, 392);
        ctx.lineTo(458, 292);
        ctx.lineTo(548, 278);
        ctx.lineTo(682, 282);
        // Up around Kesji's hair & head
        ctx.quadraticCurveTo(715, 152, 808, 156);
        ctx.quadraticCurveTo(898, 168, 882, 295);
        // Down along right mechanical arm
        ctx.lineTo(908, 455);
        ctx.lineTo(872, 608);
        ctx.lineTo(792, 615);
        ctx.lineTo(778, 535);
        ctx.lineTo(812, 445);
        // Across bottom of chest reactor (above LCD bezel)
        ctx.lineTo(745, 406);
        ctx.lineTo(510, 404);
        ctx.closePath();
      };

      // Outer 3D Drop Shadow + Energy Rim
      ctx.save();
      traceCyborgContour();
      ctx.shadowColor = this.gimmickState === 'fever' ? '#00ffcc' : '#ff0055';
      ctx.shadowBlur = 28;
      ctx.lineWidth = 4;
      ctx.strokeStyle = this.gimmickState === 'fever' ? '#ffea00' : '#ff1744';
      ctx.stroke();
      ctx.restore();

      // Clip and draw high-res Cyborg Kesji unit
      traceCyborgContour();
      ctx.clip();
      ctx.drawImage(this.cabinetImage, 0, 0, this.width, this.height);

      // Draw Cyber Eyes & Chest Reactor inside the transformed Cyborg space so they move in lockstep!
      this._drawCyborgEyesAndCore(ctx, t, isActive, drop);
      ctx.restore();
    } else {
      // In Idle / Normal state: draw glowing Cyber Eyes & Chest Reactor directly on the photo at exact coordinates!
      this._drawCyborgEyesAndCore(ctx, t, isActive, 0);
    }

    // 3. Climax Lightning Bolts & Impact Banner when Gimmick is Dropped!
    if (drop > 0.35) {
      this._drawLightningBolts(ctx, 604, 425, drop, t);
    }
  }

  /**
   * Draws glowing Cyber Eyes on Kesji's actual pupils (758,246) & (824,266)
   * and the Chest Reactor Core (682,392)
   */
  _drawCyborgEyesAndCore(ctx, t, isActive, drop) {
    // 1. Chest Reactor Core (x: 682, y: 392)
    ctx.save();
    const reactorPulse = 0.65 + 0.35 * Math.sin(t * 8);
    const coreGrad = ctx.createRadialGradient(682, 392, 2, 682, 392, 26 + drop * 18);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.35, isActive ? '#ff1744' : '#00e5ff');
    coreGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = reactorPulse;
    ctx.beginPath();
    ctx.arc(682, 392, 28 + drop * 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Kesji's Eyes: Left pupil (758, 246), Right pupil (824, 266)
    const eyeAlpha = isActive ? 0.92 : (0.25 + 0.35 * Math.max(0, Math.sin(t * 3.2)));
    const eyeColor = this.gimmickState === 'fever'
      ? `hsl(${(t * 400) % 360}, 100%, 60%)`
      : (isActive ? '#ff1744' : '#00e5ff');

    for (const eye of [{ x: 758, y: 246 }, { x: 824, y: 266 }]) {
      ctx.save();
      const radius = isActive ? 22 : 11;
      const eGrad = ctx.createRadialGradient(eye.x, eye.y, 1, eye.x, eye.y, radius);
      eGrad.addColorStop(0, '#ffffff');
      eGrad.addColorStop(0.35, eyeColor);
      eGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = eGrad;
      ctx.globalAlpha = eyeAlpha;
      ctx.beginPath();
      ctx.arc(eye.x, eye.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Horizontal lens flare streak when active
      if (isActive) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(eye.x - 28, eye.y - 4);
        ctx.lineTo(eye.x + 28, eye.y + 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawMechanicalGear(ctx, cx, cy, radius, teeth, angle, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.strokeStyle = '#3a2200';
    ctx.lineWidth = 2;

    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const r = i % 2 === 0 ? radius : radius - 8;
      const a = (i * Math.PI) / teeth;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1205';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawLightningBolts(ctx, cx, cy, intensity, t) {
    ctx.save();
    const boltCount = 5;
    for (let b = 0; b < boltCount; b++) {
      ctx.beginPath();
      let x = cx + (Math.random() - 0.5) * 80;
      let y = cy - 40;
      ctx.moveTo(x, y);
      for (let seg = 0; seg < 6; seg++) {
        x += (Math.random() - 0.5) * 95;
        y += (Math.random() - 0.3) * 55;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = b % 2 === 0 ? '#00f0ff' : '#ffea00';
      ctx.lineWidth = 2.5 + intensity * 2;
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 15;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export default PlayfieldCanvas;
