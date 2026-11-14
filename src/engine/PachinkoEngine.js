/**
 * PachinkoEngine.js - Core Pachinko Simulation Engine for 'e けすじー' (e Kesuji)
 * Fully compliant with modern Smar-Pachi (e-機) specifications:
 * - 1/349.9 Normal state probability
 * - 1/73.5 RUSH / High probability
 * - Heso (Tokuzu 1) & Denchu (Tokuzu 2) reserve queues (max 4 each)
 * - State machine: NORMAL, BONUS, RUSH_LOW (75% ST 100), RUSH_HIGH_LT (89.5% ST 165)
 * - Customization integration (先バレ, 先読み, レバブル, V-フラッシュ, エアー)
 * - Bonus payout & round management
 * - Ball tracking, rental supply, history, and slump graph generation
 * - Event bus for UI and AV coordination
 */

import { CustomConfig, defaultConfig } from './CustomConfig.js';
import {
  ScenarioBuilder,
  GAME_STATES,
  BONUS_TYPES,
  PROBABILITY
} from './ScenarioBuilder.js';

export const MAX_RESERVES = 4;
export const ST_LIMITS = Object.freeze({
  RUSH_LOW: 100,       // 継続率 約74.6% (~75%)
  RUSH_HIGH_LT: 165    // 継続率 約89.6% (~89.5%)
});

export class PachinkoEngine {
  /**
   * @param {Object} [options={}]
   * @param {CustomConfig} [options.config]
   * @param {number} [options.initialBalls=1000]
   */
  constructor(options = {}) {
    this.config = options.config || defaultConfig;

    // Game state
    this.state = GAME_STATES.NORMAL;
    this.previousState = GAME_STATES.NORMAL;

    // Reserve queues (Max 4 each)
    this.hesoQueue = [];   // 特図1
    this.denchuQueue = []; // 特図2

    // Spin state
    this.isSpinning = false;
    this.currentSpin = null;

    // Bonus state
    this.currentBonus = null;

    // ST rotations tracking
    this.stRemaining = 0;
    this.stLimit = 0;

    // Data counter statistics
    this.totalRotations = 0;
    this.currentRotations = 0;
    this.bonusCount = 0;
    this.rushStreak = 0;
    this.maxStreak = 0;
    this.currentStreakPayout = 0;

    // Ball economy & Slump graph
    this.initialBalls = options.initialBalls !== undefined ? options.initialBalls : 1000;
    this.balls = this.initialBalls;
    this.totalInvestedBalls = this.initialBalls;
    this.totalPayoutBalls = 0;
    this.history = []; // History of bonuses: [{ id, rotation, hitType, payout, timestamp }]
    this.slumpData = [
      { rotation: 0, ballDiff: 0 }
    ];

    // Event bus listeners
    this._listeners = {};

    // Auto-listen to config changes if needed
    this.config.addListener((changed) => {
      this.emit('config_change', changed);
    });
  }

  // ==========================================
  // EVENT SYSTEM
  // ==========================================

  /**
   * Register event listener
   * @param {string} event 
   * @param {Function} handler 
   * @returns {Function} unsubscribe function
   */
  on(event, handler) {
    if (!this._listeners[event]) {
      this._listeners[event] = new Set();
    }
    this._listeners[event].add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unregister event listener
   * @param {string} event 
   * @param {Function} handler 
   */
  off(event, handler) {
    if (this._listeners[event]) {
      this._listeners[event].delete(handler);
    }
  }

  /**
   * Emit an event
   * @param {string} event 
   * @param {*} data 
   */
  emit(event, data) {
    if (this._listeners[event]) {
      for (const handler of this._listeners[event]) {
        try {
          handler(data);
        } catch (err) {
          console.error(`Error in PachinkoEngine event handler [${event}]:`, err);
        }
      }
    }
  }

  // ==========================================
  // BALL ECONOMY & RENTAL
  // ==========================================

  /**
   * Shoot/consume one ball
   * @returns {boolean} Whether a ball was successfully fired
   */
  shootBall() {
    if (this.balls <= 0) {
      if (this.config.get('autoSupply')) {
        this.rentBalls(250);
      } else {
        return false;
      }
    }

    this.balls -= 1;
    this._recordSlumpPoint();
    this.emit('ball_shot', { balls: this.balls });
    return true;
  }

  /**
   * Rent balls (default 250 balls = 1000 yen equivalent)
   * @param {number} [amount=250]
   */
  rentBalls(amount = 250) {
    this.balls += amount;
    this.totalInvestedBalls += amount;
    this._recordSlumpPoint();
    this.emit('balls_rented', { amount, currentBalls: this.balls });
    this.emit('stats_change', this.getStats());
  }

  /**
   * Award payout balls
   * @param {number} amount
   */
  awardBalls(amount) {
    this.balls += amount;
    this.totalPayoutBalls += amount;
    if (this.state === GAME_STATES.RUSH_LOW || this.state === GAME_STATES.RUSH_HIGH_LT || this.state === GAME_STATES.BONUS) {
      this.currentStreakPayout += amount;
    }
    this._recordSlumpPoint();
    this.emit('balls_awarded', { amount, currentBalls: this.balls });
    this.emit('stats_change', this.getStats());
  }

  /**
   * Record a data point for slump graph
   * @private
   */
  _recordSlumpPoint() {
    const ballDiff = this.balls - this.initialBalls;
    const lastPoint = this.slumpData[this.slumpData.length - 1];

    // Only add a new point every 5 rotations or significant ball diff change to avoid bloating
    if (!lastPoint || lastPoint.rotation !== this.totalRotations || Math.abs(lastPoint.ballDiff - ballDiff) >= 100) {
      this.slumpData.push({
        rotation: this.totalRotations,
        ballDiff
      });
      // Cap slump data history at 1000 points
      if (this.slumpData.length > 1000) {
        this.slumpData.shift();
      }
    }
  }

  // ==========================================
  // RESERVE QUEUES & ENTRY
  // ==========================================

  /**
   * Ball enters Heso (特図1 - Start Chucker)
   * @returns {Object|null} Reserve object if added, null if queue is full
   */
  insertHesoBall() {
    if (this.hesoQueue.length >= MAX_RESERVES) {
      return null;
    }

    const reserve = ScenarioBuilder.preRollReserve(this.state, this.config, 1);
    this.hesoQueue.push(reserve);

    this.emit('heso_entry', { reserve, queueLength: this.hesoQueue.length });
    this.emit('reserve_change', this.getReserveQueues());

    // 先バレ発動 (Kesu-Bare sound & red flash triggered immediately upon entry)
    if (reserve.kesuBare) {
      this.emit('kesu_bare', { reserve });
    }

    return reserve;
  }

  /**
   * Ball enters Denchu (特図2 - Electric Support / Chucker)
   * @returns {Object|null} Reserve object if added, null if queue is full
   */
  insertDenchuBall() {
    if (this.denchuQueue.length >= MAX_RESERVES) {
      return null;
    }

    const reserve = ScenarioBuilder.preRollReserve(this.state, this.config, 2);
    this.denchuQueue.push(reserve);

    this.emit('denchu_entry', { reserve, queueLength: this.denchuQueue.length });
    this.emit('reserve_change', this.getReserveQueues());

    if (reserve.kesuBare) {
      this.emit('kesu_bare', { reserve });
    }

    return reserve;
  }

  /**
   * Get current reserve queues snapshot
   */
  getReserveQueues() {
    return {
      heso: [...this.hesoQueue],
      denchu: [...this.denchuQueue],
      totalCount: this.hesoQueue.length + this.denchuQueue.length
    };
  }

  // ==========================================
  // SPIN EXECUTION & SCENARIO
  // ==========================================

  /**
   * Start the next spin from available reserve queues
   * Prioritizes Denchu (Tokuzu 2) over Heso (Tokuzu 1)
   * @returns {Object|null} Generated Scenario object, or null if cannot spin
   */
  startNextSpin() {
    if (this.isSpinning || this.state === GAME_STATES.BONUS) {
      return null;
    }

    let reserve = null;
    let tokuzu = 1;

    // 電チュー優先消化 (Tokuzu 2 priority)
    if (this.denchuQueue.length > 0) {
      reserve = this.denchuQueue.shift();
      tokuzu = 2;
    } else if (this.hesoQueue.length > 0) {
      reserve = this.hesoQueue.shift();
      tokuzu = 1;
    } else {
      // No reserves available
      return null;
    }

    this.emit('reserve_change', this.getReserveQueues());

    // Generate scenario
    const scenario = ScenarioBuilder.buildScenario(reserve, this.state, this.config);
    this.currentSpin = scenario;
    this.isSpinning = true;

    // Increment rotation counters
    this.totalRotations += 1;
    this.currentRotations += 1;

    // Decrement ST rotations if in RUSH
    if (this.state === GAME_STATES.RUSH_LOW || this.state === GAME_STATES.RUSH_HIGH_LT) {
      this.stRemaining = Math.max(0, this.stRemaining - 1);
    }

    this._recordSlumpPoint();

    // Emit spin start event
    this.emit('spin_start', scenario);

    // If Revaburu triggered on spin start
    if (scenario.flags.revaburu) {
      this.emit('revaburu', { timing: 'start', scenario });
    }

    this.emit('stats_change', this.getStats());
    return scenario;
  }

  /**
   * Complete the active spin (called when UI / animation finishes)
   * Handles transitions to BONUS or returns to NORMAL if ST runs out
   * @returns {Object} Completion summary
   */
  completeSpin() {
    if (!this.isSpinning || !this.currentSpin) {
      return { success: false };
    }

    const scenario = this.currentSpin;
    this.isSpinning = false;

    if (scenario.isHit) {
      // 大当り当選
      this._transitionToBonus(scenario);
      return {
        success: true,
        isHit: true,
        bonus: this.currentBonus,
        scenario
      };
    } else {
      // ハズレ
      if (this.state === GAME_STATES.RUSH_LOW || this.state === GAME_STATES.RUSH_HIGH_LT) {
        if (this.stRemaining <= 0) {
          // ST抜け -> 通常へ転落
          this._endRush();
        }
      }

      this.emit('spin_end', {
        scenario,
        nextState: this.state
      });

      this.currentSpin = null;
      this.emit('stats_change', this.getStats());

      return {
        success: true,
        isHit: false,
        scenario
      };
    }
  }

  /**
   * Transition to BONUS state
   * @private
   */
  _transitionToBonus(scenario) {
    this.previousState = this.state;
    this._setState(GAME_STATES.BONUS);

    this.bonusCount += 1;

    if (this.previousState === GAME_STATES.RUSH_LOW || this.previousState === GAME_STATES.RUSH_HIGH_LT) {
      this.rushStreak += 1;
      this.maxStreak = Math.max(this.maxStreak, this.rushStreak);
    } else {
      if (scenario.nextState !== GAME_STATES.NORMAL) {
        this.rushStreak = 1;
        this.maxStreak = Math.max(this.maxStreak, 1);
      } else {
        this.rushStreak = 0;
      }
      this.currentStreakPayout = 0;
    }

    // Record bonus history
    this.history.unshift({
      id: `bonus_${Date.now()}`,
      rotation: this.currentRotations,
      hitType: scenario.hitType,
      payout: scenario.payout,
      timestamp: Date.now()
    });

    if (this.history.length > 50) {
      this.history.pop();
    }

    this.currentBonus = {
      id: `bonus_${Date.now()}`,
      type: scenario.hitType,
      totalRounds: scenario.rounds,
      currentRound: 1,
      roundPayout: 150,
      ballsAwarded: 0,
      targetPayout: scenario.payout,
      nextState: scenario.nextState
    };

    this.emit('bonus_start', {
      bonus: this.currentBonus,
      scenario
    });

    this.emit('stats_change', this.getStats());
  }

  // ==========================================
  // BONUS ROUNDS & RESOLUTION
  // ==========================================

  /**
   * Advance one round of the active bonus
   * Awards round payout (150 balls per 10R round)
   * @returns {Object} Round result
   */
  advanceBonusRound() {
    if (this.state !== GAME_STATES.BONUS || !this.currentBonus) {
      return { success: false };
    }

    const roundPayout = this.currentBonus.roundPayout;
    this.awardBalls(roundPayout);
    this.currentBonus.ballsAwarded += roundPayout;

    const roundCompleted = this.currentBonus.currentRound;
    this.currentBonus.currentRound += 1;

    this.emit('bonus_round', {
      round: roundCompleted,
      totalRounds: this.currentBonus.totalRounds,
      ballsAwarded: this.currentBonus.ballsAwarded,
      targetPayout: this.currentBonus.targetPayout
    });

    const isFinished = roundCompleted >= this.currentBonus.totalRounds;
    if (isFinished) {
      return this.completeBonus();
    }

    return {
      success: true,
      round: roundCompleted,
      isFinished: false
    };
  }

  /**
   * Complete the active bonus and transition to next state (NORMAL, RUSH_LOW, or RUSH_HIGH_LT)
   */
  completeBonus() {
    if (this.state !== GAME_STATES.BONUS || !this.currentBonus) {
      return { success: false };
    }

    // Award any remainder balls if needed to reach targetPayout
    const remainder = this.currentBonus.targetPayout - this.currentBonus.ballsAwarded;
    if (remainder > 0) {
      this.awardBalls(remainder);
      this.currentBonus.ballsAwarded += remainder;
    }

    const nextState = this.currentBonus.nextState;
    const totalPayout = this.currentBonus.ballsAwarded;
    const bonusType = this.currentBonus.type;

    // Reset current rotations since bonus occurred
    this.currentRotations = 0;

    // Set up next state & ST counts
    if (nextState === GAME_STATES.RUSH_LOW) {
      this.stRemaining = ST_LIMITS.RUSH_LOW;
      this.stLimit = ST_LIMITS.RUSH_LOW;
      this._setState(GAME_STATES.RUSH_LOW);
    } else if (nextState === GAME_STATES.RUSH_HIGH_LT) {
      this.stRemaining = ST_LIMITS.RUSH_HIGH_LT;
      this.stLimit = ST_LIMITS.RUSH_HIGH_LT;
      this._setState(GAME_STATES.RUSH_HIGH_LT);
    } else {
      this.stRemaining = 0;
      this.stLimit = 0;
      this.rushStreak = 0;
      this._setState(GAME_STATES.NORMAL);
    }

    this.currentBonus = null;
    this.currentSpin = null;

    this.emit('bonus_end', {
      bonusType,
      totalPayout,
      nextState: this.state,
      stRemaining: this.stRemaining
    });

    this.emit('stats_change', this.getStats());

    return {
      success: true,
      nextState: this.state,
      totalPayout,
      isFinished: true
    };
  }

  /**
   * End RUSH when ST rotations reach 0
   * @private
   */
  _endRush() {
    const finalStreak = this.rushStreak;
    const totalPayout = this.currentStreakPayout;

    this.rushStreak = 0;
    this.currentStreakPayout = 0;
    this.stRemaining = 0;
    this.stLimit = 0;

    this._setState(GAME_STATES.NORMAL);

    this.emit('rush_end', {
      finalStreak,
      totalPayout
    });
  }

  /**
   * Set internal game state and emit event
   * @private
   */
  _setState(newState) {
    if (this.state === newState) return;
    const fromState = this.state;
    this.state = newState;
    this.emit('state_change', { from: fromState, to: newState });
  }

  // ==========================================
  // STATS & QUERY API
  // ==========================================

  /**
   * Get comprehensive stats for DataCounter.js and UI components
   * @returns {Object}
   */
  getStats() {
    return {
      state: this.state,
      previousState: this.previousState,
      balls: this.balls,
      initialBalls: this.initialBalls,
      ballDiff: this.balls - this.initialBalls,
      totalInvestedBalls: this.totalInvestedBalls,
      totalPayoutBalls: this.totalPayoutBalls,
      totalRotations: this.totalRotations,
      currentRotations: this.currentRotations,
      stRemaining: this.stRemaining,
      stLimit: this.stLimit,
      bonusCount: this.bonusCount,
      rushStreak: this.rushStreak,
      maxStreak: this.maxStreak,
      currentStreakPayout: this.currentStreakPayout,
      hesoCount: this.hesoQueue.length,
      denchuCount: this.denchuQueue.length,
      isSpinning: this.isSpinning,
      isBonus: this.state === GAME_STATES.BONUS,
      history: [...this.history],
      slumpData: [...this.slumpData]
    };
  }

  // ==========================================
  // DEBUG / TEST HELPERS
  // ==========================================

  /**
   * Inject a guaranteed hit or special scenario into the queue (for testing)
   * @param {string} [specialType='RANDOM_HIT'] 'LT_3000' | 'RUSH_1500' | 'ZENKAITEN' | 'CLIMAX' | 'KESU_BARE' | 'LOSE'
   * @param {number|null} [tokuzu=null] 1 for heso, 2 for denchu, null for next queue to be popped
   */
  forceScenario(specialType = 'RANDOM_HIT', tokuzu = null) {
    const isHit = specialType !== 'LOSE';
    const targetTokuzu = tokuzu !== null ? tokuzu : (this.denchuQueue.length > 0 || this.state !== GAME_STATES.NORMAL ? 2 : 1);
    const reserve = {
      id: `force_${Date.now()}`,
      createdAt: Date.now(),
      tokuzu: targetTokuzu,
      isHit,
      specialType,
      kesuBare: specialType === 'KESU_BARE' || isHit,
      revaburu: isHit,
      icon: isHit ? 'GOLD' : 'WHITE',
      zone: isHit ? 'SUPER_EVOLUTION_ZONE' : 'NONE'
    };

    if (targetTokuzu === 2) {
      this.denchuQueue.unshift(reserve);
    } else {
      this.hesoQueue.unshift(reserve);
    }
    this.emit('reserve_change', this.getReserveQueues());
    if (reserve.kesuBare) {
      this.emit('kesu_bare', { reserve });
    }
  }
}
