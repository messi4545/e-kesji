/**
 * SoundController.js
 * Advanced Audio Synthesizer & Clip Manager for 'e けすじー' Pachinko
 * 
 * Provides:
 * - Web Audio API synthesized SFX with realistic pachinko dynamics:
 *   - Kesu-bare Pokyun! (先バレ ぽきゅーん！)
 *   - V-Flash / P-Flash (プレミア確定音 キュインキュイン！)
 *   - Revaburu (レバブル震動音)
 *   - Reel Stop (図柄停止音・左/中/右テンパイ)
 *   - Fever Fanfare (大当たりファンファーレ)
 *   - Button Push & Prompt, Chance-Up, Tenpai, Pseudo-chains
 * - Audio clip playback from sozai/ folder (voice clips, BGM)
 * - Auto-ducking, master compressor, volume mixing, and synthesized BGM fallback
 */

export class SoundController {
  constructor(options = {}) {
    this.options = {
      basePath: options.basePath || '',
      masterVolume: options.masterVolume ?? 0.8,
      sfxVolume: options.sfxVolume ?? 0.9,
      bgmVolume: options.bgmVolume ?? 0.6,
      voiceVolume: options.voiceVolume ?? 1.0,
      ...options
    };

    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.voiceGain = null;
    this.compressor = null;

    this.isUnlocked = false;
    this.muted = false;

    // Active audio clip instances & loops
    this.bgmAudio = null;
    this.currentBgmName = null;
    this.reelSpinLoopNode = null;
    this.buttonPromptTimer = null;
    this.synthBgmTimer = null;

    // Cache for decoded AudioBuffers or Audio elements
    this.audioBufferCache = new Map();
    this.audioElements = new Map();

    // Voice & BGM manifests pointing to sozai/
    this.voiceManifest = {
      'ketuana': 'sozai/ketuana.mp3',
      'messimara': 'sozai/messimara.mp3',
      'nakadasi': 'sozai/nakadasi.mp3',
      'ingo': 'sozai/けす淫語.mp3',
      'louise': 'sozai/ルイズけっくん.mp3',
      'voice1': 'sozai/voice-message.ogg',
      'voice2': 'sozai/voice-message (1).ogg',
      'kiki1': 'sozai/kikivoice-cloned-file-2026-10-27-17-10-14-1678.mp3',
      'kiki2': 'sozai/kikivoice-cloned-file-2026-10-27-17-10-19-5732.mp3',
      'kiki3': 'sozai/kikivoice-cloned-file-2026-10-27-17-11-50-1620.mp3',
      'kiki4': 'sozai/kikivoice-cloned-file-2026-10-27-17-19-20-5424.mp3',
      'kiki5': 'sozai/kikivoice-cloned-file-2026-10-27-17-19-49-7493.mp3',
      'choushinka': 'sozai/kikivoice-cloned-file-2026-10-27-17-10-14-1678.mp3'
    };

    this.bgmManifest = {
      'theme': 'sozai/audio [music].mp3',
      'battle': 'sozai/audio [music].mp3',
      'fever': 'sozai/audio [music].mp3',
      'start': 'sozai/game start.mp3'
    };

    this._initAudioContext();
  }

  /**
   * Safe AudioContext initialization with browser check
   */
  _initAudioContext() {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      this.ctx = new AudioCtxClass();

      // Master Dynamics Compressor to prevent distortion on stacked sounds
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.options.masterVolume, this.ctx.currentTime);

      // SFX Gain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.options.sfxVolume, this.ctx.currentTime);

      // BGM Gain
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(this.options.bgmVolume, this.ctx.currentTime);

      // Voice Gain
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.setValueAtTime(this.options.voiceVolume, this.ctx.currentTime);

      // Routing: Sub-mixes -> MasterGain -> Compressor -> Destination
      this.sfxGain.connect(this.masterGain);
      this.bgmGain.connect(this.masterGain);
      this.voiceGain.connect(this.masterGain);

      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      // Auto-unlock listener on first user interaction
      const unlockHandler = () => {
        this.unlock();
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
      };
      window.addEventListener('pointerdown', unlockHandler, { once: true });
      window.addEventListener('keydown', unlockHandler, { once: true });
      window.addEventListener('touchstart', unlockHandler, { once: true });

    } catch (e) {
      console.warn('[SoundController] AudioContext init failed:', e);
    }
  }

  /**
   * Unlock AudioContext on user interaction
   */
  async unlock() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn('[SoundController] Resume failed:', e);
      }
    }
    this.isUnlocked = this.ctx.state === 'running';

    // Play a tiny silent buffer to warm up mobile WebAudio
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (_) {}

    return this.isUnlocked;
  }

  /* =========================================================================
   * SYNTHESIZED SFX (Web Audio API)
   * ========================================================================= */

  /**
   * 1. Kesu-Bare "Pokyun!" (先バレ ぽきゅーん！)
   * The signature pachinko advance notice sound.
   * High resonant chime, multi-sine crystal bell, explosive sub-bass kick & sweeping shimmer.
   */
  playKesuBarePokyun() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    // --- Sub-Bass Punch (Heavy shockwave) ---
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    subOsc.connect(subGain);
    subGain.connect(sfxOut);
    subOsc.start(now);
    subOsc.stop(now + 0.45);

    // --- Resonant High "Pokyun" Sweep (Piercing laser sweep) ---
    const sweepOsc = this.ctx.createOscillator();
    const sweepFilter = this.ctx.createBiquadFilter();
    const sweepGain = this.ctx.createGain();

    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(1400, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(3200, now + 0.08);
    sweepOsc.frequency.exponentialRampToValueAtTime(2100, now + 0.45);

    sweepFilter.type = 'bandpass';
    sweepFilter.frequency.setValueAtTime(2600, now);
    sweepFilter.Q.setValueAtTime(8, now);

    sweepGain.gain.setValueAtTime(0.01, now);
    sweepGain.gain.linearRampToValueAtTime(0.85, now + 0.04);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    sweepOsc.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(sfxOut);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.75);

    // --- Celestial Crystal Chime Harmonics (Inharmonic Bell Ringing) ---
    const bellFrequencies = [2093, 2637, 3136, 4186, 5274]; // High C, E, G, C, E
    bellFrequencies.forEach((freq, idx) => {
      const bellOsc = this.ctx.createOscillator();
      const bellGain = this.ctx.createGain();
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(freq, now + idx * 0.01);

      const peakTime = now + 0.02 + idx * 0.01;
      const decayTime = 1.2 + idx * 0.15;
      bellGain.gain.setValueAtTime(0.001, now);
      bellGain.gain.linearRampToValueAtTime(0.35 / (idx + 1), peakTime);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

      bellOsc.connect(bellGain);
      bellGain.connect(sfxOut);
      bellOsc.start(now);
      bellOsc.stop(now + decayTime + 0.05);
    });

    // Voice cue alongside Pokyun
    setTimeout(() => {
      this.playVoice('kiki1', { volume: 0.8 });
    }, 150);
  }

  /**
   * 2. V-Flash / P-Flash (プレミア確定音 キュインキュインキュイン！)
   * Rapid high-frequency siren burst + ascending jackpot fanfare
   */
  playVFlash() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    // 14 Rapid Chirps (Kyu-in! Kyu-in!)
    const chirpCount = 14;
    const chirpInterval = 0.07; // 70ms per chirp

    for (let i = 0; i < chirpCount; i++) {
      const startTime = now + i * chirpInterval;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      // Rising pitch from 2400Hz to 3600Hz
      osc.frequency.setValueAtTime(2400, startTime);
      osc.frequency.exponentialRampToValueAtTime(3600, startTime + chirpInterval * 0.7);

      gain.gain.setValueAtTime(0.01, startTime);
      gain.gain.linearRampToValueAtTime(0.6, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + chirpInterval);

      osc.connect(gain);
      gain.connect(sfxOut);
      osc.start(startTime);
      osc.stop(startTime + chirpInterval);
    }

    // Follow up with continuous high siren tone
    const sirenStart = now + chirpCount * chirpInterval;
    const sirenOsc = this.ctx.createOscillator();
    const sirenGain = this.ctx.createGain();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.setValueAtTime(3200, sirenStart);
    sirenOsc.frequency.linearRampToValueAtTime(3800, sirenStart + 0.6);
    sirenOsc.frequency.linearRampToValueAtTime(3200, sirenStart + 1.2);

    sirenGain.gain.setValueAtTime(0.5, sirenStart);
    sirenGain.gain.exponentialRampToValueAtTime(0.001, sirenStart + 1.4);

    sirenOsc.connect(sirenGain);
    sirenGain.connect(sfxOut);
    sirenOsc.start(sirenStart);
    sirenOsc.stop(sirenStart + 1.5);
  }

  /**
   * 3. Revaburu (レバブル震動音)
   * High-torque mechanical vibration motor rumble (heavy 65Hz/80Hz rumble + AM flutter)
   */
  playRevaburu(duration = 1.0) {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const rumbleGain = this.ctx.createGain();

    // Tremolo AM Modulator (32Hz motor spin pulsation)
    const amOsc = this.ctx.createOscillator();
    const amGain = this.ctx.createGain();
    amOsc.type = 'square';
    amOsc.frequency.setValueAtTime(34, now);
    amGain.gain.setValueAtTime(0.35, now);
    amOsc.connect(amGain);

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(68, now);
    osc1.frequency.linearRampToValueAtTime(84, now + duration);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(74, now);
    osc2.frequency.linearRampToValueAtTime(92, now + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(190, now);

    rumbleGain.gain.setValueAtTime(0.7, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(rumbleGain);
    amGain.connect(rumbleGain.gain);
    rumbleGain.connect(sfxOut);

    osc1.start(now);
    osc2.start(now);
    amOsc.start(now);

    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
    amOsc.stop(now + duration + 0.05);
  }

  /**
   * 4. Reel Stop (図柄停止音)
   * Mechanical thud & crisp metallic latch. Pitch scales by reel position (0: left, 1: right, 2: center).
   */
  playReelStop(reelIndex = 0) {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    const baseFreqs = [180, 220, 280];
    const latchFreqs = [1200, 1500, 2000];
    const baseFreq = baseFreqs[reelIndex % 3];
    const latchFreq = latchFreqs[reelIndex % 3];

    // Thud
    const kickOsc = this.ctx.createOscillator();
    const kickGain = this.ctx.createGain();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(baseFreq, now);
    kickOsc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    kickGain.gain.setValueAtTime(0.7, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    kickOsc.connect(kickGain);
    kickGain.connect(sfxOut);
    kickOsc.start(now);
    kickOsc.stop(now + 0.15);

    // Latch click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(latchFreq, now);
    clickGain.gain.setValueAtTime(0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    clickOsc.connect(clickGain);
    clickGain.connect(sfxOut);
    clickOsc.start(now);
    clickOsc.stop(now + 0.08);

    // Center reel stop bonus flourish (if tenpai / climax stop)
    if (reelIndex === 2) {
      const ringOsc = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(1046.5, now); // C6
      ringGain.gain.setValueAtTime(0.3, now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      ringOsc.connect(ringGain);
      ringGain.connect(sfxOut);
      ringOsc.start(now);
      ringOsc.stop(now + 0.4);
    }
  }

  /**
   * Continuous Reel Spin ticking loop
   */
  playReelSpinStart() {
    this.startReelSpin();
  }

  startReelSpin() {
    if (!this.ctx || this.muted || this.reelSpinLoopNode) return;
    this.unlock();

    try {
      // Create repeating pulse buffer for reel ticks
      const bufferSize = this.ctx.sampleRate * 0.08; // 80ms tick rate
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      filter.Q.setValueAtTime(3, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      source.start();
      this.reelSpinLoopNode = { source, gain };
    } catch (e) {
      console.warn('[SoundController] startReelSpin failed:', e);
    }
  }

  stopReelSpin() {
    if (this.reelSpinLoopNode) {
      try {
        this.reelSpinLoopNode.gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        this.reelSpinLoopNode.gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
        setTimeout(() => {
          if (this.reelSpinLoopNode) {
            this.reelSpinLoopNode.source.stop();
            this.reelSpinLoopNode = null;
          }
        }, 60);
      } catch (_) {
        this.reelSpinLoopNode = null;
      }
    }
  }

  /**
   * 5. Fever Fanfare (大当たりファンファーレ)
   * Triumphant brass section & synthesizer celebration fanfare
   */
  playFeverFanfare() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    // Fanfare Notes: C5, E5, G5, C6 (Held), G5, C6
    const notes = [
      { f: 523.25, start: 0.00, dur: 0.18 }, // C5
      { f: 659.25, start: 0.18, dur: 0.18 }, // E5
      { f: 783.99, start: 0.36, dur: 0.18 }, // G5
      { f: 1046.5, start: 0.54, dur: 0.65 }, // C6
      { f: 783.99, start: 1.25, dur: 0.20 }, // G5
      { f: 1046.5, start: 1.48, dur: 1.20 }  // High C6 hold
    ];

    notes.forEach(note => {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      const t = now + note.start;
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(note.f, t);
      osc2.frequency.setValueAtTime(note.f * 1.004, t); // Slight chorus detune

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, t);
      filter.frequency.linearRampToValueAtTime(1400, t + note.dur);

      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.55, t + 0.03);
      gain.gain.setValueAtTime(0.5, t + note.dur - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(sfxOut);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + note.dur + 0.05);
      osc2.stop(t + note.dur + 0.05);
    });

    // Sub-bass crash at climax
    const climaxTime = now + 1.48;
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(130, climaxTime);
    boomOsc.frequency.exponentialRampToValueAtTime(30, climaxTime + 0.9);
    boomGain.gain.setValueAtTime(0.8, climaxTime);
    boomGain.gain.exponentialRampToValueAtTime(0.001, climaxTime + 1.1);

    boomOsc.connect(boomGain);
    boomGain.connect(sfxOut);
    boomOsc.start(climaxTime);
    boomOsc.stop(climaxTime + 1.2);
  }

  /**
   * 6. Tenpai / Reach announcement (リーチ！音)
   */
  playTenpai() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    // Dramatic rising siren + choir synth
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.4);

    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.65, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc.connect(gain);
    gain.connect(sfxOut);
    osc.start(now);
    osc.stop(now + 0.9);

    // Cymbal swell / white noise
    this._playWhiteNoiseBurst(now, 0.6, 0.4);
  }

  /**
   * 7. Pseudo-chain advance (疑似連予告音: 2連, 3連 "超進化せよ！", 4連 全回転)
   */
  playPseudoAdvance(chain = 2) {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    // Heavy crash impact
    this._playHeavyImpact(now, 1.0 + chain * 0.2);

    // Staccato rising fanfare
    const chords = {
      2: [440, 554, 659],        // A major
      3: [587, 740, 880, 1174],   // D major higher
      4: [659, 830, 987, 1318, 1661] // E major celestial
    };

    const notes = chords[chain] || chords[2];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);

      gain.gain.setValueAtTime(0.4 / notes.length, now + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(sfxOut);
      osc.start(now + i * 0.04);
      osc.stop(now + 0.8);
    });

    // At chain 3 ("超進化せよ！") trigger dramatic voice
    if (chain >= 3) {
      setTimeout(() => {
        this.playVoice('choushinka', { volume: 1.0 });
      }, 200);
    }
  }

  /**
   * 8. Chance-Up Sound (White, Red, Gold/Rainbow)
   */
  playChanceUp(level = 'white') {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const sfxOut = this.sfxGain;

    if (level === 'gold' || level === 'rainbow') {
      // Celestial sparkling harp arpeggio
      const harp = [784, 988, 1175, 1480, 1760, 2093, 2637];
      harp.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = now + idx * 0.05;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc.connect(gain);
        gain.connect(sfxOut);
        osc.start(t);
        osc.stop(t + 0.65);
      });
    } else if (level === 'red') {
      // Heavy dramatic brass stab
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(370, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);

      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(sfxOut);
      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      // Normal / White: clean shimmer
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(sfxOut);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  }

  /**
   * 9. Push Button Prompt & Push Sound
   */
  startButtonPrompt() {
    this.stopButtonPrompt();
    if (this.muted) return;

    // Heartbeat radar beeping
    let count = 0;
    this.buttonPromptTimer = setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880 + (count % 2) * 110, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.1);
      count++;
    }, 280);
  }

  stopButtonPrompt() {
    if (this.buttonPromptTimer) {
      clearInterval(this.buttonPromptTimer);
      this.buttonPromptTimer = null;
    }
  }

  playButtonPush() {
    this.stopButtonPrompt();
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    // Punchy click + laser trigger
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    this._playHeavyImpact(now, 0.4);
  }

  /**
   * 10. Ball entering Heso (入賞チャイム音)
   */
  playBallEnterHeso() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, now); // E6
    osc2.frequency.setValueAtTime(1975.5, now); // B6

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.15);
    osc2.stop(now + 0.15);
  }

  /**
   * 11. Ball payout rattle (払出音)
   */
  playBallPay() {
    if (!this.ctx || this.muted) return;
    this.unlock();

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.04 + Math.random() * 0.01;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 600, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.045);
    }
  }

  /* Helper audio synth building blocks */
  _playHeavyImpact(t, duration = 0.8) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + duration * 0.8);

    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + duration + 0.05);

    this._playWhiteNoiseBurst(t, duration * 0.4, 0.3);
  }

  _playWhiteNoiseBurst(t, duration = 0.3, vol = 0.25) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noise.start(t);
  }

  /* =========================================================================
   * VOICE & CLIP PLAYBACK (HTML5 Audio / sozai/ directory)
   * ========================================================================= */

  /**
   * Play a voice clip from sozai/ by key or file path
   */
  async playVoice(voiceKeyOrPath, options = {}) {
    if (this.muted) return;
    this.unlock();

    let path = this.voiceManifest[voiceKeyOrPath] || voiceKeyOrPath;
    if (this.options.basePath && !path.startsWith('http') && !path.startsWith('/')) {
      path = `${this.options.basePath}/${path}`.replace(/\/+/g, '/');
    }

    const vol = (options.volume ?? 1.0) * this.options.voiceVolume;

    try {
      const audio = new Audio(path);
      audio.volume = Math.max(0, Math.min(1, vol * (this.muted ? 0 : 1)));

      // Auto-duck BGM slightly while voice plays
      this._duckBgm(true);
      audio.onended = () => {
        this._duckBgm(false);
      };
      audio.onerror = (e) => {
        console.warn(`[SoundController] Voice clip '${path}' could not be played, falling back to synth voice cue`, e);
        this._duckBgm(false);
        this._playSynthVoiceCue();
      };

      await audio.play();
      return audio;
    } catch (e) {
      console.warn(`[SoundController] playVoice failed for ${path}:`, e);
      this._playSynthVoiceCue();
    }
  }

  /**
   * Synthesizer fallback if a voice file is missing or blocked
   */
  _playSynthVoiceCue() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.linearRampToValueAtTime(880, now + 0.18);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.voiceGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play random voice from voice bank
   */
  playRandomVoice() {
    const keys = Object.keys(this.voiceManifest);
    const randKey = keys[Math.floor(Math.random() * keys.length)];
    return this.playVoice(randKey);
  }

  /* =========================================================================
   * BGM MANAGEMENT
   * ========================================================================= */

  /**
   * Play BGM by name ('theme', 'battle', 'fever', 'start') or path
   */
  async playBGM(bgmName = 'theme', options = {}) {
    if (this.currentBgmName === bgmName && this.bgmAudio && !this.bgmAudio.paused) {
      return; // Already playing
    }

    this.stopBGM(options.fade ?? true);

    let path = this.bgmManifest[bgmName] || bgmName;
    if (this.options.basePath && !path.startsWith('http') && !path.startsWith('/')) {
      path = `${this.options.basePath}/${path}`.replace(/\/+/g, '/');
    }

    this.currentBgmName = bgmName;
    const loop = options.loop ?? true;
    const targetVol = (options.volume ?? 1.0) * this.options.bgmVolume;

    try {
      const audio = new Audio(path);
      audio.loop = loop;
      audio.volume = this.muted ? 0 : 0.01;

      this.bgmAudio = audio;
      await audio.play();

      // Smooth fade-in
      let currentVol = 0.01;
      const step = targetVol / 15;
      const fadeInterval = setInterval(() => {
        if (!this.bgmAudio || this.bgmAudio !== audio) {
          clearInterval(fadeInterval);
          return;
        }
        currentVol = Math.min(targetVol, currentVol + step);
        this.bgmAudio.volume = this.muted ? 0 : currentVol;
        if (currentVol >= targetVol) {
          clearInterval(fadeInterval);
        }
      }, 50);

    } catch (e) {
      console.warn(`[SoundController] BGM play failed for '${path}', activating Synth BGM fallback`, e);
      this.startSynthBGM();
    }
  }

  stopBGM(fade = true) {
    this.stopSynthBGM();
    if (!this.bgmAudio) return;

    const audio = this.bgmAudio;
    this.bgmAudio = null;
    this.currentBgmName = null;

    if (!fade) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }

    let vol = audio.volume;
    const fadeTimer = setInterval(() => {
      vol = Math.max(0, vol - 0.1);
      audio.volume = vol;
      if (vol <= 0.01) {
        clearInterval(fadeTimer);
        audio.pause();
        audio.currentTime = 0;
      }
    }, 40);
  }

  _duckBgm(enable) {
    if (!this.bgmAudio) return;
    const targetVol = enable ? this.options.bgmVolume * 0.25 : this.options.bgmVolume;
    this.bgmAudio.volume = this.muted ? 0 : Math.max(0, Math.min(1, targetVol));
  }

  /**
   * Synthesized BGM loop fallback (Electronic pachinko bassline & arpeggio)
   */
  startSynthBGM() {
    this.stopSynthBGM();
    if (!this.ctx || this.muted) return;

    const bassline = [130.81, 130.81, 155.56, 174.61, 130.81, 196.00, 174.61, 155.56]; // C3 groove
    let step = 0;

    this.synthBgmTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassline[step % bassline.length], now);

      gain.gain.setValueAtTime(0.12 * this.options.bgmVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.2);

      step++;
    }, 200);
  }

  stopSynthBGM() {
    if (this.synthBgmTimer) {
      clearInterval(this.synthBgmTimer);
      this.synthBgmTimer = null;
    }
  }

  /* =========================================================================
   * VOLUME & MUTING
   * ========================================================================= */

  setMasterVolume(val) {
    this.options.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.options.masterVolume, this.ctx.currentTime);
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.muted ? 0 : this.options.bgmVolume * this.options.masterVolume;
    }
  }

  setSFXVolume(val) {
    this.options.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.options.sfxVolume, this.ctx.currentTime);
    }
  }

  setBGMVolume(val) {
    this.options.bgmVolume = Math.max(0, Math.min(1, val));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.options.bgmVolume, this.ctx.currentTime);
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.muted ? 0 : this.options.bgmVolume;
    }
  }

  setMute(isMuted) {
    this.muted = !!isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.options.masterVolume, this.ctx.currentTime);
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.muted ? 0 : this.options.bgmVolume;
    }
  }

  toggleMute() {
    this.setMute(!this.muted);
    return this.muted;
  }

  destroy() {
    this.stopReelSpin();
    this.stopButtonPrompt();
    this.stopBGM(false);
    this.stopSynthBGM();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch (_) {}
    }
  }
}

export default SoundController;
