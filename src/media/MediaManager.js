/**
 * MediaManager.js
 * Master Audio & Video Coordinator for 'e けすじー' Pachinko
 * 
 * Unifies SoundController (Web Audio API / Synthesizer / Audio Clips)
 * and VideoPlayer (Seamless LCD Video Overlays) into a clean, event-friendly facade.
 */

import { SoundController } from './SoundController.js';
import { VideoPlayer } from './VideoPlayer.js';

export class MediaManager {
  constructor(options = {}) {
    this.options = {
      basePath: options.basePath || '',
      masterVolume: options.masterVolume ?? 0.8,
      sfxVolume: options.sfxVolume ?? 0.9,
      bgmVolume: options.bgmVolume ?? 0.6,
      voiceVolume: options.voiceVolume ?? 1.0,
      videoVolume: options.videoVolume ?? 0.9,
      ...options
    };

    // Sub-controllers
    this.sound = new SoundController({
      basePath: this.options.basePath,
      masterVolume: this.options.masterVolume,
      sfxVolume: this.options.sfxVolume,
      bgmVolume: this.options.bgmVolume,
      voiceVolume: this.options.voiceVolume
    });

    this.video = new VideoPlayer({
      basePath: this.options.basePath,
      volume: this.options.videoVolume
    });

    this.isMuted = false;
    this.activeReachType = null;
    this.bgmBeforeVideo = null;
  }

  /**
   * Mount to LCD screen container & prepare audio/video playback
   * @param {HTMLElement|string} container - Container element or selector
   */
  init(container) {
    if (container) {
      this.video.mount(container);
    }

    // Preload heavy media in background
    setTimeout(() => {
      this.preloadAssets();
    }, 1000);

    return this;
  }

  /**
   * Unlock Web Audio & Video playback upon first user interaction
   */
  async unlockAudio() {
    return await this.sound.unlock();
  }

  /**
   * Preload critical video & audio resources
   */
  preloadAssets() {
    try {
      this.video.preload(['climax_sp', 'zenkaiten']);
    } catch (e) {
      console.warn('[MediaManager] Preload warning:', e);
    }
  }

  /* =========================================================================
   * PACHINKO SOUND FX (Synthesizer & Samples)
   * ========================================================================= */

  /**
   * 先バレ「ぽきゅーん！」(Kesu-bare Pokyun)
   */
  playKesuBare() {
    this.sound.playKesuBarePokyun();
  }

  /**
   * プレミア確定音「V-フラッシュ / P-フラッシュ」(Kyu-in! Kyu-in!)
   */
  playVFlash() {
    this.sound.playVFlash();
  }

  /**
   * レバーバイブ音「レバブル」
   */
  playRevaburu(duration = 1.0) {
    this.sound.playRevaburu(duration);
  }

  /**
   * 図柄停止音 (0: 左, 1: 右, 2: 中)
   */
  playReelStop(reelIndex = 0) {
    this.sound.playReelStop(reelIndex);
  }

  /**
   * 図柄回転音開始
   */
  startReelSpin() {
    this.sound.startReelSpin();
  }

  /**
   * 図柄回転音停止
   */
  stopReelSpin() {
    this.sound.stopReelSpin();
  }

  /**
   * リーチ成立音 (Tenpai)
   */
  playTenpai() {
    this.sound.playTenpai();
  }

  /**
   * 疑似連継続音 (chain: 2, 3 "超進化せよ！", 4 全回転)
   */
  playPseudoAdvance(chain = 2) {
    this.sound.playPseudoAdvance(chain);
  }

  /**
   * チャンスアップ音 (white, red, gold, rainbow)
   */
  playChanceUp(level = 'white') {
    this.sound.playChanceUp(level);
  }

  /**
   * ボタンPUSH促進音開始
   */
  startButtonPrompt() {
    this.sound.startButtonPrompt();
  }

  /**
   * ボタンPUSH促進音停止
   */
  stopButtonPrompt() {
    this.sound.stopButtonPrompt();
  }

  /**
   * ボタン押下音 (Mechanical punch & laser chime)
   */
  playButtonPush() {
    this.sound.playButtonPush();
  }

  /**
   * へそ入賞音 (Start pocket chime)
   */
  playBallEnterHeso() {
    this.sound.playBallEnterHeso();
  }

  /**
   * 玉払出音 (Payout cascade)
   */
  playBallPay() {
    this.sound.playBallPay();
  }

  /**
   * 大当たりファンファーレ (Jackpot Fanfare)
   */
  playFeverFanfare() {
    this.sound.playFeverFanfare();
  }

  /**
   * ボイスクリップ再生 (sozai/ からの再生)
   */
  playVoice(voiceKey, options = {}) {
    return this.sound.playVoice(voiceKey, options);
  }

  playRandomVoice() {
    return this.sound.playRandomVoice();
  }

  /* =========================================================================
   * BGM MANAGEMENT
   * ========================================================================= */

  playBGM(name = 'theme', options = {}) {
    return this.sound.playBGM(name, options);
  }

  stopBGM(fade = true) {
    this.sound.stopBGM(fade);
  }

  /* =========================================================================
   * SEAMLESS VIDEO OVERLAY & REACH SEQUENCES
   * ========================================================================= */

  /**
   * Play SP Reach or Special Video Sequence
   * Automatically ducks/pauses BGM while video audio plays, and restores BGM when done.
   * 
   * @param {string} reachType - 'climax_sp', 'zenkaiten', 'battle_sp', 'mission_sp', 'trailer_sp'
   * @param {object} options - { cues, onProgress, allowSkip, volume }
   * @returns {Promise<boolean>} resolves when video finishes or skips
   */
  async playReachVideo(reachType = 'climax_sp', options = {}) {
    this.activeReachType = reachType;
    this.bgmBeforeVideo = this.sound.currentBgmName;

    // Map high level reach types to video keys
    const reachVideoMap = {
      'climax_sp': 'climax_sp',         // 超進化フル結合版
      'climax': 'climax_sp',
      'zenkaiten': 'zenkaiten',         // キタCUE MV
      'all_rotations': 'zenkaiten',
      'battle_sp': 'action_street',     // Street overdrive
      'mission_sp': 'action_helicopter',// Helicopter mission
      'trailer_sp': 'action_trailer'    // Blockbuster trailer
    };

    const targetKey = reachVideoMap[reachType] || reachType;

    // Duck background music while cinematic video plays
    this.sound.stopBGM(true);

    try {
      const completed = await this.video.play(targetKey, {
        fadeIn: 350,
        fadeOut: 350,
        allowSkip: options.allowSkip ?? true,
        cues: options.cues || [],
        onProgress: options.onProgress,
        volume: options.volume ?? this.options.videoVolume
      });

      this.activeReachType = null;
      return completed;
    } catch (e) {
      console.warn('[MediaManager] playReachVideo failed:', e);
      this.activeReachType = null;
      return false;
    }
  }

  /**
   * Stop any active video overlay immediately
   */
  stopVideo(fade = true) {
    this.activeReachType = null;
    this.video.stop(fade);
  }

  /**
   * Skip active video
   */
  skipVideo() {
    this.video.skip();
  }

  /* =========================================================================
   * MASTER VOLUME & MUTE CONTROLS
   * ========================================================================= */

  setMasterVolume(val) {
    this.options.masterVolume = Math.max(0, Math.min(1, val));
    this.sound.setMasterVolume(this.options.masterVolume);
    this.video.setVolume(this.options.videoVolume * this.options.masterVolume);
  }

  setSFXVolume(val) {
    this.options.sfxVolume = Math.max(0, Math.min(1, val));
    this.sound.setSFXVolume(this.options.sfxVolume);
  }

  setBGMVolume(val) {
    this.options.bgmVolume = Math.max(0, Math.min(1, val));
    this.sound.setBGMVolume(this.options.bgmVolume);
  }

  setVoiceVolume(val) {
    this.options.voiceVolume = Math.max(0, Math.min(1, val));
    this.sound.options.voiceVolume = this.options.voiceVolume;
  }

  setVideoVolume(val) {
    this.options.videoVolume = Math.max(0, Math.min(1, val));
    this.video.setVolume(this.options.videoVolume * this.options.masterVolume);
  }

  setMute(isMuted) {
    this.isMuted = !!isMuted;
    this.sound.setMute(this.isMuted);
    this.video.setMute(this.isMuted);
  }

  toggleMute() {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  destroy() {
    this.sound.destroy();
    this.video.destroy();
  }
}

export default MediaManager;
