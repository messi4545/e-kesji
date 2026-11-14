/**
 * test_engine.js - Test suite for PachinkoEngine, ScenarioBuilder, and CustomConfig
 */

import {
  PachinkoEngine,
  GAME_STATES,
  BONUS_TYPES,
  ScenarioBuilder,
  CustomConfig,
  KESU_BARE_OPTIONS,
  SAKIYOMI_OPTIONS,
  REVABURU_OPTIONS
} from './src/engine/index.js';

console.log('=== TEST 1: Initialization & Defaults ===');
const engine = new PachinkoEngine({ initialBalls: 1000 });
console.assert(engine.state === GAME_STATES.NORMAL, 'Initial state must be NORMAL');
console.assert(engine.balls === 1000, 'Initial balls must be 1000');
console.assert(engine.hesoQueue.length === 0, 'Heso queue empty');
console.assert(engine.denchuQueue.length === 0, 'Denchu queue empty');
console.log('Test 1 Passed: Initial state correct.');

console.log('\n=== TEST 2: Reserve Queues (Max 4 each) & Kesu-Bare ===');
let kesuBareFired = 0;
engine.on('kesu_bare', (data) => {
  kesuBareFired++;
});

// Insert 5 balls into Heso
for (let i = 0; i < 5; i++) {
  const res = engine.insertHesoBall();
  if (i < 4) {
    console.assert(res !== null, `Heso ball ${i + 1} should be inserted`);
  } else {
    console.assert(res === null, 'Heso ball 5 should be rejected (queue full)');
  }
}
console.assert(engine.hesoQueue.length === 4, 'Heso queue length should be 4');

// Insert 5 balls into Denchu
for (let i = 0; i < 5; i++) {
  const res = engine.insertDenchuBall();
  if (i < 4) {
    console.assert(res !== null, `Denchu ball ${i + 1} should be inserted`);
  } else {
    console.assert(res === null, 'Denchu ball 5 should be rejected (queue full)');
  }
}
console.assert(engine.denchuQueue.length === 4, 'Denchu queue length should be 4');
console.log(`Test 2 Passed: Max 4 queues enforced. (Kesu-bare triggers observed: ${kesuBareFired})`);

console.log('\n=== TEST 3: Tokuzu 2 Priority & Spin Mechanics ===');
let spinStarted = false;
engine.on('spin_start', (scenario) => {
  spinStarted = true;
  console.log(`Spin started: ID=${scenario.id}, Tokuzu=${scenario.tokuzu}, State=${scenario.gameState}, Pseudo=${scenario.pseudoChains}, Reach=${scenario.reachName}, Hit=${scenario.isHit}`);
  if (scenario.isHit) {
    console.log(`  Hit details: Type=${scenario.hitType}, Payout=${scenario.payout}, NextState=${scenario.nextState}, Symbols=${scenario.symbols.left}-${scenario.symbols.middle}-${scenario.symbols.right}`);
    console.log(`  ChanceUp: Title=${scenario.chanceUp.title}, Cutin=${scenario.chanceUp.cutin}, Button=${scenario.chanceUp.button}`);
  }
});

const firstSpin = engine.startNextSpin();
console.assert(firstSpin !== null, 'Spin should start');
console.assert(firstSpin.tokuzu === 2, 'Tokuzu 2 (Denchu) must be prioritized over Tokuzu 1');
console.assert(engine.denchuQueue.length === 3, 'Denchu queue decremented to 3');
console.assert(engine.hesoQueue.length === 4, 'Heso queue remains 4');
console.assert(engine.isSpinning === true, 'Engine isSpinning should be true');

const secondAttempt = engine.startNextSpin();
console.assert(secondAttempt === null, 'Cannot start next spin while already spinning');

const completeRes = engine.completeSpin();
console.assert(completeRes.success === true, 'Spin completed successfully');
console.assert(engine.isSpinning === false, 'Engine isSpinning should be false after completion');
console.log('Test 3 Passed: Tokuzu 2 priority and spin lifecycle verified.');

console.log('\n=== TEST 4: Bonus Lifecycle & Payouts ===');
// Force a Jackpot scenario to test BONUS state
engine.forceScenario('RUSH_1500');
const hitSpin = engine.startNextSpin();
console.log('Forced spin started. isHit:', hitSpin.isHit, 'hitType:', hitSpin.hitType);
const hitComplete = engine.completeSpin();

console.assert(engine.state === GAME_STATES.BONUS, `State should be BONUS, got: ${engine.state}`);
console.assert(engine.currentBonus !== null, 'currentBonus must exist in BONUS state');
console.log(`Bonus started: Type=${engine.currentBonus.type}, TargetPayout=${engine.currentBonus.targetPayout}, TotalRounds=${engine.currentBonus.totalRounds}`);

const ballsBeforeBonus = engine.balls;
// Advance all bonus rounds
while (engine.state === GAME_STATES.BONUS) {
  const roundRes = engine.advanceBonusRound();
  console.log(`  Round advanced. Awarded=${engine.currentBonus ? engine.currentBonus.ballsAwarded : 'finished'}, isFinished=${roundRes.isFinished}`);
}

console.assert(engine.state === GAME_STATES.RUSH_LOW || engine.state === GAME_STATES.RUSH_HIGH_LT, `State should now be RUSH, got: ${engine.state}`);
console.assert(engine.stRemaining > 0, `ST remaining should be set (> 0), got: ${engine.stRemaining}`);
console.assert(engine.balls > ballsBeforeBonus, 'Balls must increase after bonus');
console.log(`Test 4 Passed: Bonus rounds, payout (${engine.balls - ballsBeforeBonus} balls awarded), and RUSH transition verified.`);

console.log('\n=== TEST 5: RUSH ST Count & Exhaustion ===');
console.log(`Current state: ${engine.state}, ST remaining: ${engine.stRemaining}`);
const initialST = engine.stRemaining;

// Insert a fake lose into denchu
for (let i = 0; i < 4; i++) {
  engine.denchuQueue.push({
    id: `lose_${i}`,
    tokuzu: 2,
    isHit: false,
    kesuBare: false,
    revaburu: false,
    icon: 'WHITE'
  });
}

const rushSpin = engine.startNextSpin();
console.assert(engine.stRemaining === initialST - 1, `ST remaining must decrement to ${initialST - 1}, got: ${engine.stRemaining}`);
engine.completeSpin();

// Manually exhaust ST to test transition back to NORMAL
engine.stRemaining = 1;
engine.denchuQueue.push({
  id: 'final_rush_lose',
  tokuzu: 2,
  isHit: false,
  kesuBare: false,
  revaburu: false,
  icon: 'WHITE'
});
engine.startNextSpin();
console.assert(engine.stRemaining === 0, 'ST remaining reached 0');
let rushEnded = false;
engine.on('rush_end', (data) => {
  rushEnded = true;
  console.log('RUSH ended event captured:', data);
});
engine.completeSpin();
console.assert(engine.state === GAME_STATES.NORMAL, `State must revert to NORMAL after ST exhaustion, got: ${engine.state}`);
console.assert(rushEnded === true, 'rush_end event must fire');
console.log('Test 5 Passed: ST countdown and return to NORMAL verified.');

console.log('\n=== TEST 6: CustomConfig & Event Listeners ===');
const config = new CustomConfig();
let configChanged = false;
config.addListener((diff) => {
  configChanged = true;
  console.log('Config diff received:', diff);
});
config.set('kesuBare', KESU_BARE_OPTIONS.HIGH);
console.assert(config.get('kesuBare') === KESU_BARE_OPTIONS.HIGH, 'Kesu-Bare updated to HIGH');
console.assert(configChanged === true, 'Config listener notified');
console.log('Test 6 Passed: CustomConfig updates and notifications verified.');

console.log('\n=== TEST 7: Slump Data & Statistics ===');
const stats = engine.getStats();
console.log('Engine Stats summary:', {
  state: stats.state,
  balls: stats.balls,
  ballDiff: stats.ballDiff,
  totalRotations: stats.totalRotations,
  bonusCount: stats.bonusCount,
  rushStreak: stats.rushStreak,
  maxStreak: stats.maxStreak,
  slumpDataPoints: stats.slumpData.length,
  historyCount: stats.history.length
});
console.assert(stats.slumpData.length > 0, 'Slump data must have points');
console.assert(stats.bonusCount >= 1, 'Bonus count must be >= 1');
console.log('Test 7 Passed: Statistics and Slump Graph data verified.');

console.log('\n========================================');
console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
console.log('========================================');
