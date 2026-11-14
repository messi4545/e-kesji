/**
 * ScenarioBuilder.js - Scenario Generator for 'e けすじー' (e Kesuji)
 * Decides full cinematic simulation sequences for each pachinko spin:
 * - Win/Lose determination and bonus tier allocation
 * - Pre-reading / Sakiyomi reserve icon & Kesu-Bare & Revaburu triggers
 * - Pseudo-chains (1~4)
 * - Reach branching (Normal, Character SP, Climax SP, Zenkaiten, Revival)
 * - Chance-up flags (Title, Telop, Cut-in, LightGuide, Button/Lever)
 * - Exact reel symbol combinations (Tenpai / Matched / Miss)
 * - Media hints (Videos, BGM, SFX cues, Voice lines)
 */

import {
  KESU_BARE_OPTIONS,
  SAKIYOMI_OPTIONS,
  REVABURU_OPTIONS,
  V_FLASH_OPTIONS
} from './CustomConfig.js';

// Probabilities
export const PROBABILITY = Object.freeze({
  NORMAL: 1 / 349.9,   // 通常時確率 (約1/349.9)
  RUSH: 1 / 73.5       // RUSH・高確率時 (約1/73.5)
});

// Game States
export const GAME_STATES = Object.freeze({
  NORMAL: 'NORMAL',
  BONUS: 'BONUS',
  RUSH_LOW: 'RUSH_LOW',          // ケスジーRUSH (継続率約75%, ST100回)
  RUSH_HIGH_LT: 'RUSH_HIGH_LT'   // 超ケスジーRUSH LT (継続率約89.5%, ST165回)
});

// Bonus Types
export const BONUS_TYPES = Object.freeze({
  PREMIUM_FEVER_3000: 'PREMIUM_FEVER_3000', // 10R×2 = 3000発 + LT直行
  KESUJI_FEVER_1500: 'KESUJI_FEVER_1500',   // 10R = 1500発 + RUSH
  CHALLENGE_FEVER: 'CHALLENGE_FEVER',       // 10R = 1500発 (通常・時短なし)
  HYPER_LT_3000: 'HYPER_LT_3000',           // 10R×2 = 3000発 + LT昇格
  HYPER_LT_1500: 'HYPER_LT_1500',           // 10R = 1500発 + LT昇格
  ULTIMATE_3000: 'ULTIMATE_3000',           // 10R×2 = 3000発 (LTループ)
  ULTIMATE_1500: 'ULTIMATE_1500'            // 10R = 1500発 (LTループ)
});

// Reserve / Sakiyomi Icon Colors
export const RESERVE_ICONS = Object.freeze({
  WHITE: 'WHITE',       // 通常保留 (信頼度 < 1%)
  POINT: 'POINT',       // 点滅保留 (信頼度 約5%)
  BLUE: 'BLUE',         // 青保留 (信頼度 約8%)
  GREEN: 'GREEN',       // 緑保留 (信頼度 約18%)
  RED: 'RED',           // 赤保留 (信頼度 約70% 激熱)
  GOLD: 'GOLD',         // 金保留 (信頼度 約92% 超激熱)
  KESUJI: 'KESUJI',     // ケスジー保留 (信頼度 約85%)
  RAINBOW: 'RAINBOW'    // 虹保留 (信頼度 100% 当確)
});

// Zone Notices
export const ZONES = Object.freeze({
  NONE: 'NONE',
  OVERLORD_ZONE: 'OVERLORD_ZONE',             // オーバードゾーン (信頼度 約40%)
  SUPER_EVOLUTION_ZONE: 'SUPER_EVOLUTION_ZONE' // 超進化ゾーン (信頼度 約75%)
});

// Reach Types
export const REACH_TYPES = Object.freeze({
  NONE: 'NONE',                       // ノーマルハズレ (リーチなし)
  NORMAL_REACH: 'NORMAL_REACH',       // ノーマルリーチ (信頼度 約1%)
  CHARACTER_SP: 'CHARACTER_SP',       // キャラクターSPリーチ (信頼度 約15~25%)
  CLIMAX_SP: 'CLIMAX_SP',             // オーバードケスモン超進化リーチ (信頼度 約68%)
  ZENKAITEN: 'ZENKAITEN',             // キタCUE 全回転リーチ (信頼度 100% / 3000 LT)
  REVIVAL: 'REVIVAL',                 // 復活当り (ハズレ後にブラックアウト→777復活)
  // RUSH専用高速リーチ
  RUSH_FAST_STOP: 'RUSH_FAST_STOP',   // 高速ハズレ
  RUSH_BATTLE_REACH: 'RUSH_BATTLE_REACH', // RUSH中バトル
  RUSH_INSTANT_HIT: 'RUSH_INSTANT_HIT'    // 一発告知/即撃破
});

// Chance Up Colors & Levels
export const CHANCE_UP = Object.freeze({
  TITLE: { WHITE: 'WHITE', RED: 'RED', GOLD: 'GOLD', RAINBOW: 'RAINBOW' },
  TELOP: { WHITE: 'WHITE', RED: 'RED', GOLD: 'GOLD' },
  CUTIN: { NONE: 'NONE', GREEN: 'GREEN', RED: 'RED', GOLD: 'GOLD', RAINBOW: 'RAINBOW' },
  LIGHT_GUIDE: { NONE: 'NONE', WHITE: 'WHITE', RED: 'RED', RAINBOW: 'RAINBOW' },
  BUTTON: { NORMAL: 'NORMAL', RED: 'RED', BIG: 'BIG', POPUPOUT_LEVER: 'POPUPOUT_LEVER', RAINBOW_V: 'RAINBOW_V' }
});

// Symbols Map (1~9)
export const SYMBOLS_DEF = Object.freeze({
  1: { num: 1, name: 'けすじー', color: 'blue', isRush: true },
  2: { num: 2, name: 'メッシ', color: 'blue', isRush: false },
  3: { num: 3, name: 'キキ', color: 'silver', isRush: true },
  4: { num: 4, name: 'ルイズ', color: 'blue', isRush: false },
  5: { num: 5, name: 'クソモン', color: 'green', isRush: true },
  6: { num: 6, name: 'オーバード', color: 'green', isRush: false },
  7: { num: 7, name: '超けすじー', color: 'gold', isRush: true, isLT: true },
  8: { num: 8, name: '淫語師', color: 'purple', isRush: false },
  9: { num: 9, name: 'けっくん', color: 'red', isRush: true }
});

export class ScenarioBuilder {
  /**
   * Determine Hit or Lose based on current state
   * @param {string} gameState 
   * @returns {boolean}
   */
  static rollHit(gameState) {
    const isRush = gameState === GAME_STATES.RUSH_LOW || gameState === GAME_STATES.RUSH_HIGH_LT;
    const probability = isRush ? PROBABILITY.RUSH : PROBABILITY.NORMAL;
    return Math.random() < probability;
  }

  /**
   * Pre-roll reserve metadata at insertion time (for 先読み / 先バレ / レバブル cues)
   * @param {string} gameState 
   * @param {import('./CustomConfig.js').CustomConfig|Object} config 
   * @param {number} tokuzu 1: Heso, 2: Denchu
   * @returns {Object} Pre-rolled reserve outcome preview
   */
  static preRollReserve(gameState, config, tokuzu = 1) {
    const isHit = this.rollHit(gameState);
    const cfg = config.settings || config;

    // 先バレ判定 (Kesu-Bare)
    let kesuBare = false;
    if (cfg.kesuBare !== KESU_BARE_OPTIONS.OFF) {
      if (isHit) {
        // 大当り時は高確率で先バレ発生 (~90% or 95%)
        kesuBare = cfg.kesuBare === KESU_BARE_OPTIONS.HIGH ? Math.random() < 0.95 : Math.random() < 0.90;
      } else {
        // ハズレ時のガセ発生率 (通常: ~0.386%, HIGH: ~0.272%) -> 信頼度約40%~50%に正確に収束
        // P(Hit∩Bare) / P(Bare) = ~40% (出現率 約1/155)
        const fakeRate = cfg.kesuBare === KESU_BARE_OPTIONS.HIGH ? 0.00272 : 0.00386;
        kesuBare = Math.random() < fakeRate;
      }
    }

    // 先読み保留アイコン決定 (Reserve Icon)
    let icon = RESERVE_ICONS.WHITE;
    let zone = ZONES.NONE;

    if (cfg.sakiyomi !== SAKIYOMI_OPTIONS.OFF) {
      if (isHit) {
        const rand = Math.random();
        if (rand < 0.12) icon = RESERVE_ICONS.RAINBOW;
        else if (rand < 0.35) icon = RESERVE_ICONS.GOLD;
        else if (rand < 0.55) icon = RESERVE_ICONS.KESUJI;
        else if (rand < 0.85) icon = RESERVE_ICONS.RED;
        else if (rand < 0.95) icon = RESERVE_ICONS.GREEN;
        else icon = RESERVE_ICONS.BLUE;

        // ゾーン先読み
        if (Math.random() < 0.40) {
          zone = Math.random() < 0.65 ? ZONES.SUPER_EVOLUTION_ZONE : ZONES.OVERLORD_ZONE;
        }
      } else {
        // ハズレ時
        const sakiyomiLevel = cfg.sakiyomi;
        const allowFakeHot = sakiyomiLevel !== SAKIYOMI_OPTIONS.SUPER_HOT;

        const rand = Math.random();
        if (rand < 0.82) {
          icon = RESERVE_ICONS.WHITE;
        } else if (rand < 0.92) {
          icon = RESERVE_ICONS.POINT;
        } else if (rand < 0.97) {
          icon = RESERVE_ICONS.BLUE;
        } else if (rand < 0.992) {
          icon = RESERVE_ICONS.GREEN;
        } else if (allowFakeHot && rand < 0.998) {
          // ガセ赤保留 (稀に出現)
          icon = RESERVE_ICONS.RED;
        }

        if (allowFakeHot && Math.random() < 0.015) {
          zone = ZONES.OVERLORD_ZONE;
        }
      }
    }

    // 先バレ発生時は保留を赤または点滅に変化させることが多い
    if (kesuBare && (icon === RESERVE_ICONS.WHITE || icon === RESERVE_ICONS.POINT)) {
      icon = RESERVE_ICONS.RED;
    }

    // レバブル先行フラグ (変動開始時または当落時用)
    let revaburu = false;
    if (cfg.revaburu !== REVABURU_OPTIONS.OFF) {
      if (isHit) {
        revaburu = cfg.revaburu === REVABURU_OPTIONS.SUPER_HOT ? Math.random() < 0.92 : Math.random() < 0.65;
      } else {
        // ハズレ時のレバブル (SUPER_HOTならほぼゼロ、通常でも極めてレア 0.5%)
        revaburu = cfg.revaburu === REVABURU_OPTIONS.SUPER_HOT ? false : Math.random() < 0.005;
      }
    }

    return {
      id: `res_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      createdAt: Date.now(),
      tokuzu,
      isHit,
      kesuBare,
      revaburu,
      icon,
      zone
    };
  }

  /**
   * Build complete scenario object from reserve or direct roll
   * @param {Object} reserve Pre-rolled reserve item
   * @param {string} gameState Current game state
   * @param {import('./CustomConfig.js').CustomConfig|Object} config 
   * @returns {Object} Complete Spin Scenario
   */
  static buildScenario(reserve, gameState, config) {
    const cfg = config.settings || config;
    const isHit = reserve.isHit;
    const tokuzu = reserve.tokuzu || 1;

    let hitType = null;
    let payout = 0;
    let rounds = 0;
    let nextState = gameState;

    if (isHit) {
      if (reserve.specialType === 'LT_3000' || reserve.specialType === 'ZENKAITEN') {
        hitType = BONUS_TYPES.PREMIUM_FEVER_3000;
        payout = 3000;
        rounds = 20;
        nextState = GAME_STATES.RUSH_HIGH_LT;
      } else if (reserve.specialType === 'RUSH_1500') {
        hitType = BONUS_TYPES.KESUJI_FEVER_1500;
        payout = 1500;
        rounds = 10;
        nextState = GAME_STATES.RUSH_LOW;
      } else {
        const outcome = this._allocateBonus(gameState, tokuzu);
        hitType = outcome.hitType;
        payout = outcome.payout;
        rounds = outcome.rounds;
        nextState = outcome.nextState;
      }
    } else {
      hitType = 'LOSE';
      payout = 0;
      rounds = 0;
      nextState = gameState;
    }

    // 擬似連 (Pseudo Chains 1~4)
    const pseudoChains = this._decidePseudoChains(isHit, hitType, gameState, reserve);

    // リーチ系統 (Reach Branch)
    const reach = this._decideReach(isHit, hitType, pseudoChains, gameState, reserve);

    // チャンスアップ (Chance-Up Flags)
    const chanceUp = this._decideChanceUp(isHit, reach.type, cfg);

    // 図柄決定 (Symbols 1~9)
    const symbols = this._decideSymbols(isHit, hitType, reach.type);

    // V-フラッシュ & エアー吹出告知判定
    let vFlash = false;
    let airBlow = false;
    if (isHit) {
      if (cfg.vFlash === V_FLASH_OPTIONS.ON) {
        const isLTorRush = nextState === GAME_STATES.RUSH_HIGH_LT || nextState === GAME_STATES.RUSH_LOW;
        if (isLTorRush && Math.random() < 0.35) {
          vFlash = true;
        }
      }
      if (cfg.airBlow !== 'OFF' && Math.random() < 0.40) {
        airBlow = true;
      }
    }

    // メディアヒント (Video, Audio, SE triggers)
    const mediaHints = this._generateMediaHints(reach, pseudoChains, isHit, hitType, {
      kesuBare: reserve.kesuBare,
      revaburu: reserve.revaburu,
      vFlash,
      airBlow
    });

    const isRush = gameState === GAME_STATES.RUSH_LOW || gameState === GAME_STATES.RUSH_HIGH_LT;
    const estimatedDurationMs = this._calculateDuration(isRush, reach.type, pseudoChains);

    return {
      id: reserve.id || `spin_${Date.now()}`,
      timestamp: Date.now(),
      tokuzu,
      gameState,
      nextState,
      isHit,
      hitType,
      payout,
      rounds,
      symbols,
      isTenpai: reach.type !== REACH_TYPES.NONE && reach.type !== REACH_TYPES.RUSH_FAST_STOP,
      pseudoChains,
      reachType: reach.type,
      reachName: reach.name,
      chanceUp,
      flags: {
        kesuBare: reserve.kesuBare,
        revaburu: reserve.revaburu,
        vFlash,
        airBlow,
        revival: reach.type === REACH_TYPES.REVIVAL
      },
      reserveIcon: reserve.icon || RESERVE_ICONS.WHITE,
      zone: reserve.zone || ZONES.NONE,
      mediaHints,
      estimatedDurationMs
    };
  }

  /**
   * Allocate Bonus details based on state and tokuzu
   * @private
   */
  static _allocateBonus(gameState, tokuzu) {
    const rand = Math.random();

    if (gameState === GAME_STATES.NORMAL) {
      // 通常時 (ヘソ 特図1):
      // 1% : 3000発 + LT直行 (RUSH_HIGH_LT 89.5%)
      // 54% : 1500発 + KESUJI RUSH (RUSH_LOW 75%, ST100回)
      // 45% : 1500発 + チャレンジボーナス (通常へ)
      if (rand < 0.01) {
        return {
          hitType: BONUS_TYPES.PREMIUM_FEVER_3000,
          payout: 3000,
          rounds: 20, // 10R × 2
          nextState: GAME_STATES.RUSH_HIGH_LT
        };
      } else if (rand < 0.55) {
        return {
          hitType: BONUS_TYPES.KESUJI_FEVER_1500,
          payout: 1500,
          rounds: 10,
          nextState: GAME_STATES.RUSH_LOW
        };
      } else {
        return {
          hitType: BONUS_TYPES.CHALLENGE_FEVER,
          payout: 1500,
          rounds: 10,
          nextState: GAME_STATES.NORMAL
        };
      }
    } else if (gameState === GAME_STATES.RUSH_LOW) {
      // RUSH_LOW中 (電チュー 特図2):
      // 25% : 3000発 + LT昇格 (RUSH_HIGH_LT)
      // 25% : 1500発 + LT昇格 (RUSH_HIGH_LT)
      // 50% : 1500発 + RUSH_LOWループ (ST100回リセット)
      if (rand < 0.25) {
        return {
          hitType: BONUS_TYPES.HYPER_LT_3000,
          payout: 3000,
          rounds: 20,
          nextState: GAME_STATES.RUSH_HIGH_LT
        };
      } else if (rand < 0.50) {
        return {
          hitType: BONUS_TYPES.HYPER_LT_1500,
          payout: 1500,
          rounds: 10,
          nextState: GAME_STATES.RUSH_HIGH_LT
        };
      } else {
        return {
          hitType: BONUS_TYPES.KESUJI_FEVER_1500,
          payout: 1500,
          rounds: 10,
          nextState: GAME_STATES.RUSH_LOW
        };
      }
    } else {
      // RUSH_HIGH_LT中 (電チュー 特図2):
      // 30% : 3000発 + LT継続 (ST165回リセット)
      // 70% : 1500発 + LT継続 (ST165回リセット)
      if (rand < 0.30) {
        return {
          hitType: BONUS_TYPES.ULTIMATE_3000,
          payout: 3000,
          rounds: 20,
          nextState: GAME_STATES.RUSH_HIGH_LT
        };
      } else {
        return {
          hitType: BONUS_TYPES.ULTIMATE_1500,
          payout: 1500,
          rounds: 10,
          nextState: GAME_STATES.RUSH_HIGH_LT
        };
      }
    }
  }

  /**
   * Decide Pseudo Chains (擬似連 1~4)
   * @private
   */
  static _decidePseudoChains(isHit, hitType, gameState, reserve = null) {
    if (reserve?.specialType === 'ZENKAITEN') {
      return 4;
    }
    if (reserve?.specialType === 'CLIMAX') {
      return 3;
    }

    if (gameState !== GAME_STATES.NORMAL) {
      // RUSH中はテンポ重視のため基本は擬似1 (即発展または高速煽り)
      return 1;
    }

    if (isHit) {
      const rand = Math.random();
      if (hitType === BONUS_TYPES.PREMIUM_FEVER_3000 && rand < 0.40) {
        return 4; // 擬似4 全回転確定演出
      }
      if (rand < 0.70) return 3; // 擬似3 超進化予告経由
      if (rand < 0.90) return 2; // 擬似2
      return 1; // 直撃・フリーズなど
    } else {
      const rand = Math.random();
      if (rand < 0.60) return 1; // リーチなし or ノーマルリーチ
      if (rand < 0.88) return 2; // 擬似2ハズレ
      return 3;                 // 擬似3ハズレ (超進化リーチ外れ)
      // ハズレで擬似4は絶対なし
    }
  }

  /**
   * Decide Reach Branch
   * @private
   */
  static _decideReach(isHit, hitType, pseudoChains, gameState, reserve = null) {
    if (reserve?.specialType === 'ZENKAITEN') {
      return { type: REACH_TYPES.ZENKAITEN, name: 'キタCUE SK Y 全回転リーチ' };
    }
    if (reserve?.specialType === 'CLIMAX') {
      return { type: REACH_TYPES.CLIMAX_SP, name: 'オーバードケスモン超進化リーチ' };
    }
    const isRush = gameState === GAME_STATES.RUSH_LOW || gameState === GAME_STATES.RUSH_HIGH_LT;

    if (isRush) {
      if (isHit) {
        const rand = Math.random();
        if (rand < 0.45) {
          return { type: REACH_TYPES.RUSH_INSTANT_HIT, name: '一発即当り告知' };
        } else {
          return { type: REACH_TYPES.RUSH_BATTLE_REACH, name: 'ケスジー疾風バトル' };
        }
      } else {
        const rand = Math.random();
        if (rand < 0.80) {
          return { type: REACH_TYPES.RUSH_FAST_STOP, name: 'ハズレ高速停止' };
        } else {
          return { type: REACH_TYPES.RUSH_BATTLE_REACH, name: 'ケスジー疾風バトル (ハズレ)' };
        }
      }
    }

    // 通常時
    if (pseudoChains === 4) {
      return { type: REACH_TYPES.ZENKAITEN, name: 'キタCUE SK Y 全回転リーチ' };
    }

    if (isHit) {
      const rand = Math.random();
      if (pseudoChains === 3) {
        if (rand < 0.82) {
          return { type: REACH_TYPES.CLIMAX_SP, name: 'オーバードケスモン超進化リーチ' };
        } else if (rand < 0.95) {
          return { type: REACH_TYPES.CHARACTER_SP, name: 'メッシ対決リーチ' };
        } else {
          return { type: REACH_TYPES.REVIVAL, name: '復活大当り' };
        }
      } else if (pseudoChains === 2) {
        if (rand < 0.60) {
          return { type: REACH_TYPES.CHARACTER_SP, name: 'キキ捜索リーチ' };
        } else {
          return { type: REACH_TYPES.CLIMAX_SP, name: 'オーバードケスモン超進化リーチ' };
        }
      } else {
        if (rand < 0.40) {
          return { type: REACH_TYPES.NORMAL_REACH, name: 'ノーマルリーチ当り' };
        } else {
          return { type: REACH_TYPES.CLIMAX_SP, name: 'オーバードケスモン超進化リーチ' };
        }
      }
    } else {
      // ハズレ
      if (pseudoChains === 3) {
        return { type: REACH_TYPES.CLIMAX_SP, name: 'オーバードケスモン超進化リーチ (ハズレ)' };
      } else if (pseudoChains === 2) {
        return { type: REACH_TYPES.CHARACTER_SP, name: 'メッシ対決リーチ (ハズレ)' };
      } else {
        const rand = Math.random();
        if (rand < 0.70) {
          return { type: REACH_TYPES.NONE, name: '通常ハズレ' };
        } else {
          return { type: REACH_TYPES.NORMAL_REACH, name: 'ノーマルリーチハズレ' };
        }
      }
    }
  }

  /**
   * Decide Chance-up Flags
   * @private
   */
  static _decideChanceUp(isHit, reachType, cfg) {
    if (reachType === REACH_TYPES.NONE || reachType === REACH_TYPES.RUSH_FAST_STOP) {
      return {
        title: CHANCE_UP.TITLE.WHITE,
        telop: CHANCE_UP.TELOP.WHITE,
        cutin: CHANCE_UP.CUTIN.NONE,
        lightGuide: CHANCE_UP.LIGHT_GUIDE.NONE,
        button: CHANCE_UP.BUTTON.NORMAL
      };
    }

    if (reachType === REACH_TYPES.ZENKAITEN) {
      return {
        title: CHANCE_UP.TITLE.RAINBOW,
        telop: CHANCE_UP.TELOP.GOLD,
        cutin: CHANCE_UP.CUTIN.RAINBOW,
        lightGuide: CHANCE_UP.LIGHT_GUIDE.RAINBOW,
        button: CHANCE_UP.BUTTON.RAINBOW_V
      };
    }

    if (isHit) {
      const rand = Math.random();
      const title = rand < 0.20 ? CHANCE_UP.TITLE.GOLD : rand < 0.75 ? CHANCE_UP.TITLE.RED : CHANCE_UP.TITLE.WHITE;
      const telop = Math.random() < 0.65 ? CHANCE_UP.TELOP.RED : CHANCE_UP.TELOP.GOLD;
      const cutin = rand < 0.30 ? CHANCE_UP.CUTIN.GOLD : rand < 0.85 ? CHANCE_UP.CUTIN.RED : CHANCE_UP.CUTIN.GREEN;
      const lightGuide = Math.random() < 0.60 ? CHANCE_UP.LIGHT_GUIDE.RED : CHANCE_UP.LIGHT_GUIDE.WHITE;
      const button = rand < 0.35 ? CHANCE_UP.BUTTON.POPUPOUT_LEVER : rand < 0.70 ? CHANCE_UP.BUTTON.BIG : CHANCE_UP.BUTTON.RED;

      return { title, telop, cutin, lightGuide, button };
    } else {
      // ハズレ
      const rand = Math.random();
      const title = rand < 0.20 ? CHANCE_UP.TITLE.RED : CHANCE_UP.TITLE.WHITE;
      const telop = rand < 0.15 ? CHANCE_UP.TELOP.RED : CHANCE_UP.TELOP.WHITE;
      const cutin = rand < 0.12 ? CHANCE_UP.CUTIN.RED : rand < 0.35 ? CHANCE_UP.CUTIN.GREEN : CHANCE_UP.CUTIN.NONE;
      const lightGuide = rand < 0.15 ? CHANCE_UP.LIGHT_GUIDE.WHITE : CHANCE_UP.LIGHT_GUIDE.NONE;
      const button = CHANCE_UP.BUTTON.NORMAL;

      return { title, telop, cutin, lightGuide, button };
    }
  }

  /**
   * Decide Reel Symbols (Left, Middle, Right)
   * @private
   */
  static _decideSymbols(isHit, hitType, reachType) {
    if (isHit) {
      let matchNum = 1;
      if (hitType === BONUS_TYPES.PREMIUM_FEVER_3000 || hitType === BONUS_TYPES.HYPER_LT_3000 || hitType === BONUS_TYPES.ULTIMATE_3000) {
        matchNum = 7; // 金の超けすじー (3000 LT)
      } else if (hitType === BONUS_TYPES.KESUJI_FEVER_1500 || hitType === BONUS_TYPES.HYPER_LT_1500 || hitType === BONUS_TYPES.ULTIMATE_1500) {
        // 奇数図柄 (3, 9, 1, 5)
        const rushNums = [3, 9, 1, 5];
        matchNum = rushNums[Math.floor(Math.random() * rushNums.length)];
      } else {
        // 偶数図柄 (2, 4, 6, 8)
        const evenNums = [2, 4, 6, 8];
        matchNum = evenNums[Math.floor(Math.random() * evenNums.length)];
      }

      return { left: matchNum, middle: matchNum, right: matchNum };
    } else {
      // ハズレ
      if (reachType === REACH_TYPES.NONE || reachType === REACH_TYPES.RUSH_FAST_STOP) {
        // テンパイなし: 左と右が不一致
        const left = Math.floor(Math.random() * 9) + 1;
        let right = Math.floor(Math.random() * 9) + 1;
        while (right === left) {
          right = Math.floor(Math.random() * 9) + 1;
        }
        const middle = Math.floor(Math.random() * 9) + 1;
        return { left, middle, right };
      } else {
        // テンパイあり: 左と右が一致、中が不一致
        const reachNum = Math.floor(Math.random() * 9) + 1;
        let middle = Math.floor(Math.random() * 9) + 1;
        while (middle === reachNum) {
          middle = Math.floor(Math.random() * 9) + 1;
        }
        return { left: reachNum, middle, right: reachNum };
      }
    }
  }

  /**
   * Generate Media Hints for audio and video controllers
   * @private
   */
  static _generateMediaHints(reach, pseudoChains, isHit, hitType, flags) {
    let videoSrc = null;
    let bgmKey = 'normal_stage';
    let voiceKey = null;
    const seTriggers = [];

    if (flags.kesuBare) {
      seTriggers.push('kesu_bare_pokyun');
    }
    if (flags.revaburu) {
      seTriggers.push('revaburu_motor');
    }
    if (flags.vFlash) {
      seTriggers.push('v_flash_fanfare');
    }

    if (pseudoChains >= 2) seTriggers.push('giji_chain_1');
    if (pseudoChains >= 3) seTriggers.push('giji_chain_super_evolution');

    if (reach.type === REACH_TYPES.CLIMAX_SP) {
      videoSrc = 'sozai/オーバードケスモン_超進化_フル結合版.mp4';
      bgmKey = 'climax_reach';
      voiceKey = 'kiki_voice_encourage';
      seTriggers.push('climax_dramatic_intro');
    } else if (reach.type === REACH_TYPES.ZENKAITEN) {
      videoSrc = 'sozai/キタCUE_SK_Y_Remastered_MV.mp4';
      bgmKey = 'zenkaiten_mv';
      seTriggers.push('zenkaiten_rainbow_sound');
    } else if (reach.type === REACH_TYPES.CHARACTER_SP) {
      bgmKey = 'battle_stage';
      voiceKey = 'messi_voice';
    }

    if (isHit) {
      seTriggers.push('jackpot_hit_fanfare');
    }

    return {
      videoSrc,
      bgmKey,
      voiceKey,
      seTriggers
    };
  }

  /**
   * Approximate duration of animation in ms
   * @private
   */
  static _calculateDuration(isRush, reachType, pseudoChains) {
    if (isRush) {
      if (reachType === REACH_TYPES.RUSH_FAST_STOP) return 900;
      if (reachType === REACH_TYPES.RUSH_INSTANT_HIT) return 1800;
      return 4500;
    }

    if (reachType === REACH_TYPES.ZENKAITEN) return 16000;
    if (reachType === REACH_TYPES.CLIMAX_SP) return 12500;
    if (reachType === REACH_TYPES.CHARACTER_SP) return 7500;
    if (reachType === REACH_TYPES.NORMAL_REACH) return 4000;
    if (pseudoChains === 3) return 6000;
    if (pseudoChains === 2) return 4500;
    return 2800;
  }
}
