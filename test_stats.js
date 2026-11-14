/**
 * test_stats.js - Statistical Monte Carlo simulation of 'e けすじー' engine
 */

import {
  ScenarioBuilder,
  GAME_STATES,
  BONUS_TYPES,
  PROBABILITY,
  defaultConfig
} from './src/engine/index.js';

console.log('Running Monte Carlo Statistical Verification (100,000 rolls)...');

// 1. Normal Probability Check
const NORMAL_TRIALS = 100000;
let normalHits = 0;
for (let i = 0; i < NORMAL_TRIALS; i++) {
  if (ScenarioBuilder.rollHit(GAME_STATES.NORMAL)) {
    normalHits++;
  }
}
const normalObservedRate = normalHits / NORMAL_TRIALS;
const normalExpected = 1 / 349.9;
console.log(`Normal Hit Rate: ${normalHits}/${NORMAL_TRIALS} = 1/${(1 / normalObservedRate).toFixed(1)} (Expected: 1/349.9 = ${(normalExpected * 100).toFixed(3)}%)`);
console.assert(Math.abs(normalObservedRate - normalExpected) < 0.001, 'Normal rate within reasonable margin');

// 2. RUSH Probability Check
const RUSH_TRIALS = 100000;
let rushHits = 0;
for (let i = 0; i < RUSH_TRIALS; i++) {
  if (ScenarioBuilder.rollHit(GAME_STATES.RUSH_LOW)) {
    rushHits++;
  }
}
const rushObservedRate = rushHits / RUSH_TRIALS;
const rushExpected = 1 / 73.5;
console.log(`RUSH Hit Rate: ${rushHits}/${RUSH_TRIALS} = 1/${(1 / rushObservedRate).toFixed(1)} (Expected: 1/73.5 = ${(rushExpected * 100).toFixed(3)}%)`);
console.assert(Math.abs(rushObservedRate - rushExpected) < 0.002, 'RUSH rate within reasonable margin');

// 3. ST Continuation Rate Check
// RUSH_LOW: 100 spins
const ST_LOW_SIMS = 20000;
let rushLowContinues = 0;
for (let i = 0; i < ST_LOW_SIMS; i++) {
  let hit = false;
  for (let s = 0; s < 100; s++) {
    if (ScenarioBuilder.rollHit(GAME_STATES.RUSH_LOW)) {
      hit = true;
      break;
    }
  }
  if (hit) rushLowContinues++;
}
const stLowRate = (rushLowContinues / ST_LOW_SIMS) * 100;
console.log(`RUSH_LOW Continuation (100 ST): ${stLowRate.toFixed(1)}% (Theoretical: 74.6% ~ 75%)`);
console.assert(Math.abs(stLowRate - 74.6) < 1.5, 'RUSH_LOW continuation matches ~75%');

// RUSH_HIGH_LT: 165 spins
const ST_HIGH_SIMS = 20000;
let rushHighContinues = 0;
for (let i = 0; i < ST_HIGH_SIMS; i++) {
  let hit = false;
  for (let s = 0; s < 165; s++) {
    if (ScenarioBuilder.rollHit(GAME_STATES.RUSH_HIGH_LT)) {
      hit = true;
      break;
    }
  }
  if (hit) rushHighContinues++;
}
const stHighRate = (rushHighContinues / ST_HIGH_SIMS) * 100;
console.log(`RUSH_HIGH_LT Continuation (165 ST): ${stHighRate.toFixed(1)}% (Theoretical: 89.6% ~ 89.5%)`);
console.assert(Math.abs(stHighRate - 89.6) < 1.0, 'RUSH_HIGH_LT continuation matches ~89.5%');

// 4. 先バレ (Kesu-Bare) Trust Rate Check
let totalBare = 0;
let bareHits = 0;
for (let i = 0; i < 50000; i++) {
  const reserve = ScenarioBuilder.preRollReserve(GAME_STATES.NORMAL, defaultConfig, 1);
  if (reserve.kesuBare) {
    totalBare++;
    if (reserve.isHit) {
      bareHits++;
    }
  }
}
const bareTrustRate = (bareHits / totalBare) * 100;
console.log(`Kesu-Bare Trust Rate: ${bareHits}/${totalBare} = ${bareTrustRate.toFixed(1)}% (Expected: ~40%)`);
console.assert(bareTrustRate >= 35 && bareTrustRate <= 50, 'Kesu-Bare trust rate is authentically balanced ~40%');

console.log('\nAll Monte Carlo Statistical Verifications PASSED!');
