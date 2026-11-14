/**
 * CustomConfig.js - Customization Settings for 'e けすじー' (e Kesuji)
 * Manages player preferences: 先バレ (Kesu-Bare), 先読み (Sakiyomi), レバブル (Revaburu),
 * V-フラッシュ (V-Flash), エアー吹出 (Air-Blow), and audio/gameplay options.
 */

export const KESU_BARE_OPTIONS = Object.freeze({
  OFF: 'OFF',         // 先バレなし
  NORMAL: 'NORMAL',   // 通常先バレ: 信頼度約40%, 出現率約1/120
  HIGH: 'HIGH'        // 激熱先バレ: 信頼度約50%, 出現率約1/180
});

export const SAKIYOMI_OPTIONS = Object.freeze({
  OFF: 'OFF',             // 先読み演出なし
  NORMAL: 'NORMAL',       // オススメ: バランス良く先読みが発生
  CHANCE: 'CHANCE',       // チャンス: 先読み発生時のトータル信頼度約45%以上
  SUPER_HOT: 'SUPER_HOT'  // 熱: 先読み発生で信頼度約90%以上（ガセ極少）
});

export const REVABURU_OPTIONS = Object.freeze({
  OFF: 'OFF',             // レバーバイブなし
  ON: 'ON',               // レバブル発生で信頼度約75%
  SUPER_HOT: 'SUPER_HOT'  // 大チャンス: レバブル発生で信頼度約95%+, 大当り占有率アップ
});

export const V_FLASH_OPTIONS = Object.freeze({
  OFF: 'OFF',
  ON: 'ON'                // RUSH/LT当選時の一発告知V-フラッシュ発生率アップ
});

export const AIR_BLOW_OPTIONS = Object.freeze({
  OFF: 'OFF',
  ON: 'ON'                // 大当り時の風・P-フラッシュ告知
});

export const STORAGE_KEY = 'e_kesuji_custom_config_v1';

export class CustomConfig {
  /**
   * @param {Object} [initialSettings={}]
   */
  constructor(initialSettings = {}) {
    this._listeners = new Set();

    // Default configuration values
    this.settings = {
      kesuBare: KESU_BARE_OPTIONS.NORMAL,
      sakiyomi: SAKIYOMI_OPTIONS.NORMAL,
      revaburu: REVABURU_OPTIONS.ON,
      vFlash: V_FLASH_OPTIONS.ON,
      airBlow: AIR_BLOW_OPTIONS.ON,
      autoSupply: true,    // 自動玉貸し / 補給
      autoFire: false,     // 自動発射
      volume: {
        master: 0.8,
        bgm: 0.7,
        se: 0.85,
        voice: 0.9
      }
    };

    // Load from storage if available
    this.loadFromStorage();

    // Override with any explicitly passed settings
    if (initialSettings && typeof initialSettings === 'object') {
      this.update(initialSettings, false);
    }
  }

  /**
   * Get a configuration value
   * @param {string} key 
   * @returns {*}
   */
  get(key) {
    return this.settings[key];
  }

  /**
   * Set a single configuration value
   * @param {string} key 
   * @param {*} value 
   */
  set(key, value) {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    this.saveToStorage();
    this._notifyListeners({ [key]: value });
  }

  /**
   * Update multiple configuration values at once
   * @param {Object} newSettings 
   * @param {boolean} [persist=true]
   */
  update(newSettings, persist = true) {
    let changed = false;
    const diff = {};

    for (const [key, val] of Object.entries(newSettings)) {
      if (key === 'volume' && typeof val === 'object' && val !== null) {
        this.settings.volume = { ...this.settings.volume, ...val };
        diff.volume = { ...this.settings.volume };
        changed = true;
      } else if (this.settings[key] !== val) {
        this.settings[key] = val;
        diff[key] = val;
        changed = true;
      }
    }

    if (changed) {
      if (persist) {
        this.saveToStorage();
      }
      this._notifyListeners(diff);
    }
  }

  /**
   * Reset all settings to defaults
   */
  reset() {
    this.settings = {
      kesuBare: KESU_BARE_OPTIONS.NORMAL,
      sakiyomi: SAKIYOMI_OPTIONS.NORMAL,
      revaburu: REVABURU_OPTIONS.ON,
      vFlash: V_FLASH_OPTIONS.ON,
      airBlow: AIR_BLOW_OPTIONS.ON,
      autoSupply: true,
      autoFire: false,
      volume: {
        master: 0.8,
        bgm: 0.7,
        se: 0.85,
        voice: 0.9
      }
    };
    this.saveToStorage();
    this._notifyListeners({ ...this.settings });
  }

  /**
   * Register a listener for config changes
   * @param {Function} callback 
   * @returns {Function} unsubscribe function
   */
  addListener(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
    return () => this.removeListener(callback);
  }

  /**
   * Remove a registered listener
   * @param {Function} callback 
   */
  removeListener(callback) {
    this._listeners.delete(callback);
  }

  /**
   * Notify all registered listeners
   * @private
   */
  _notifyListeners(diff) {
    for (const listener of this._listeners) {
      try {
        listener(diff, { ...this.settings });
      } catch (err) {
        console.error('Error in CustomConfig listener:', err);
      }
    }
  }

  /**
   * Save configuration to localStorage
   */
  saveToStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      } catch (err) {
        console.warn('Failed to save CustomConfig to localStorage:', err);
      }
    }
  }

  /**
   * Load configuration from localStorage
   */
  loadFromStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object') {
            this.settings = {
              ...this.settings,
              ...parsed,
              volume: {
                ...this.settings.volume,
                ...(parsed.volume || {})
              }
            };
          }
        }
      } catch (err) {
        console.warn('Failed to load CustomConfig from localStorage:', err);
      }
    }
  }

  /**
   * Get formatted display labels for UI modal
   */
  static getOptionLabels() {
    return {
      kesuBare: [
        { value: KESU_BARE_OPTIONS.OFF, label: 'OFF (なし)' },
        { value: KESU_BARE_OPTIONS.NORMAL, label: '通常 (ポキューン♪ / 信頼度 約40%)' },
        { value: KESU_BARE_OPTIONS.HIGH, label: '激熱 (先バレ超高信頼度 / 約50%)' }
      ],
      sakiyomi: [
        { value: SAKIYOMI_OPTIONS.OFF, label: 'なし (先読みなし)' },
        { value: SAKIYOMI_OPTIONS.NORMAL, label: 'オススメ (標準)' },
        { value: SAKIYOMI_OPTIONS.CHANCE, label: 'チャンス (信頼度 約45%+)' },
        { value: SAKIYOMI_OPTIONS.SUPER_HOT, label: '熱 (信頼度 約90%+)' }
      ],
      revaburu: [
        { value: REVABURU_OPTIONS.OFF, label: 'OFF (なし)' },
        { value: REVABURU_OPTIONS.ON, label: '通常 (発生で信頼度 約75%)' },
        { value: REVABURU_OPTIONS.SUPER_HOT, label: '大チャンス (発生で信頼度 約95%)' }
      ],
      vFlash: [
        { value: V_FLASH_OPTIONS.OFF, label: 'OFF' },
        { value: V_FLASH_OPTIONS.ON, label: 'ON (告知アップ)' }
      ],
      airBlow: [
        { value: AIR_BLOW_OPTIONS.OFF, label: 'OFF' },
        { value: AIR_BLOW_OPTIONS.ON, label: 'ON (エアー告知)' }
      ]
    };
  }

  /**
   * Return a snapshot copy of current settings
   * @returns {Object}
   */
  toJSON() {
    return JSON.parse(JSON.stringify(this.settings));
  }
}

// Global default singleton instance
export const defaultConfig = new CustomConfig();
