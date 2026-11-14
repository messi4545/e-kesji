/**
 * VideoPlayer.js
 * Seamless Video Overlay Controller for 'e けすじー' Pachinko
 * 
 * Provides:
 * - Seamless LCD overlay playback with crossfade transitions
 * - Support for Climax SP Reach (超進化フル結合版), Zenkaiten MV (キタCUE), Action SPs, and battle scenes
 * - Cue point triggering (for synchronized chance-up cut-ins, button prompts, fever flashes)
 * - Safe fallback & Promise-based control flow (game sequence never blocks on playback error)
 * - Volume control and coordination with SoundController
 */

export class VideoPlayer {
  constructor(options = {}) {
    this.options = {
      basePath: options.basePath || '',
      volume: options.volume ?? 1.0,
      muted: options.muted ?? false,
      container: options.container || null,
      ...options
    };

    this.container = null;
    this.videoElements = []; // Ping-pong dual video elements for zero-flicker transitions
    this.activeVideoIndex = 0;
    this.currentPromise = null;
    this.currentResolve = null;
    this.activeCues = [];
    this.firedCues = new Set();
    this.isPlaying = false;
    this.currentKey = null;

    // Video Manifest mapping semantic keys to sozai/ paths
    this.manifest = {
      'climax_sp': 'sozai/オーバードケスモン_超進化_フル結合版.mp4',
      'climax_natural': 'sozai/オーバードケスモン_超進化_自然結合版.mp4',
      'climax_closeup': 'sozai/オーバードケスモン_超進化_アップ直結版.mp4',
      'zenkaiten': 'sozai/キタCUE_SK_Y_Remastered_MV.mp4',
      'zenkaiten_alt': 'sozai/キタCUE⇒⇒SK💩Y -2026- Vo.KKN feat.KRHR.mp4',
      'action_helicopter': 'sozai/Action_Movie_Scenes/action_scene_1_helicopter_mission.mp4',
      'action_street': 'sozai/Action_Movie_Scenes/action_scene_2_street_overdrive.mp4',
      'action_trailer': 'sozai/Action_Movie_Scenes/action_scene_3_blockbuster_trailer.mp4',
      'action_compilation': 'sozai/Action_Movie_Scenes/action_trailer_compilation.mp4',
      'download_1': 'sozai/ダウンロード.mp4',
      'download_2': 'sozai/ダウンロード (1).mp4',
      'short_cut': 'sozai/20251001_2051_01k6fsknqafrzvwccnhdp863at.mp4'
    };

    if (this.options.container) {
      this.mount(this.options.container);
    }
  }

  /**
   * Mount overlay player to a DOM container (e.g. #lcd-screen or #screen-container)
   */
  mount(containerOrSelector) {
    if (typeof document === 'undefined') return;

    if (typeof containerOrSelector === 'string') {
      this.container = document.querySelector(containerOrSelector);
    } else {
      this.container = containerOrSelector;
    }

    if (!this.container) {
      console.warn('[VideoPlayer] Target container not found. Video will operate in headless/fallback mode.');
      return;
    }

    // Ensure container has relative/absolute positioning
    const style = window.getComputedStyle(this.container);
    if (style.position === 'static') {
      this.container.style.position = 'relative';
    }

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'pachinko-video-overlay-wrapper';
    wrapper.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: transparent;
      transition: background-color 0.3s ease;
    `;

    // Create two ping-pong video elements for seamless switching
    this.videoElements = [0, 1].map(i => {
      const v = document.createElement('video');
      v.className = `pachinko-video-layer layer-${i}`;
      v.playsInline = true;
      v.webkitPlaysInline = true;
      v.muted = this.options.muted;
      v.volume = this.options.volume;
      v.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;
        background-color: #000;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        pointer-events: none;
      `;
      wrapper.appendChild(v);
      return v;
    });

    this.container.appendChild(wrapper);
    this.wrapper = wrapper;

    this._bindEvents();
  }

  _bindEvents() {
    this.videoElements.forEach((video, index) => {
      video.addEventListener('timeupdate', () => {
        if (index === this.activeVideoIndex && this.isPlaying) {
          this._checkCues(video.currentTime, video.duration);
        }
      });

      video.addEventListener('ended', () => {
        if (index === this.activeVideoIndex && this.isPlaying) {
          this._handleVideoEnded(video);
        }
      });

      video.addEventListener('error', (err) => {
        if (index === this.activeVideoIndex && this.isPlaying) {
          console.warn(`[VideoPlayer] Error playing video on layer ${index}:`, err);
          this._handleVideoEnded(video, true);
        }
      });
    });
  }

  /**
   * Resolve source path using manifest or direct path
   */
  resolvePath(keyOrPath) {
    let path = this.manifest[keyOrPath] || keyOrPath;
    if (this.options.basePath && !path.startsWith('http') && !path.startsWith('/')) {
      path = `${this.options.basePath}/${path}`.replace(/\/+/g, '/');
    }
    return path;
  }

  /**
   * Preload videos into browser cache
   */
  preload(keys = ['climax_sp', 'zenkaiten']) {
    if (typeof document === 'undefined') return;

    keys.forEach(key => {
      const src = this.resolvePath(key);
      const v = document.createElement('video');
      v.preload = 'auto';
      v.src = src;
      v.load();
    });
  }

  /**
   * Play a video overlay seamlessly
   * @param {string} videoKeyOrPath - Semantic key (e.g. 'climax_sp', 'zenkaiten') or video file path
   * @param {object} options
   * @returns {Promise<boolean>} resolves when video finishes or skips (true if completed, false if skipped/error)
   */
  async play(videoKeyOrPath, options = {}) {
    const src = this.resolvePath(videoKeyOrPath);
    this.currentKey = videoKeyOrPath;

    // Abort previous if currently playing
    if (this.isPlaying) {
      this.stop(false);
    }

    const {
      fadeIn = 300,
      fadeOut = 300,
      loop = false,
      volume = this.options.volume,
      muted = this.options.muted,
      startTime = 0,
      timeout = 0,
      cues = [],
      allowSkip = true,
      onProgress = null
    } = options;

    this.activeCues = cues;
    this.firedCues = new Set();
    this.isPlaying = true;
    this.currentOptions = { fadeIn, fadeOut, loop, allowSkip, onProgress, timeout };

    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }

    if (timeout > 0) {
      this._timeoutTimer = setTimeout(() => {
        if (this.isPlaying) {
          this.skip();
        }
      }, timeout);
    }

    return new Promise((resolve) => {
      this.currentResolve = resolve;

      // If no DOM container available, simulate playback duration
      if (!this.wrapper || this.videoElements.length === 0) {
        console.warn(`[VideoPlayer] No DOM wrapper mounted. Simulating video playback for '${videoKeyOrPath}'`);
        const simDuration = videoKeyOrPath === 'zenkaiten' ? 6000 : 8000;
        setTimeout(() => {
          if (this.isPlaying) {
            this.isPlaying = false;
            resolve(true);
          }
        }, simDuration);
        return;
      }

      // Ping-pong switch to next video element
      const nextIndex = (this.activeVideoIndex + 1) % 2;
      const currentVideo = this.videoElements[this.activeVideoIndex];
      const nextVideo = this.videoElements[nextIndex];

      nextVideo.src = src;
      nextVideo.loop = loop;
      nextVideo.muted = muted;
      nextVideo.volume = Math.max(0, Math.min(1, volume));
      nextVideo.style.objectFit = options.fitMode || this.options.fitMode || 'contain';
      nextVideo.style.backgroundColor = '#000000';

      if (startTime > 0) {
        nextVideo.currentTime = startTime;
      }

      nextVideo.style.transition = `opacity ${fadeIn}ms ease-in-out`;
      nextVideo.style.opacity = '0';
      nextVideo.style.pointerEvents = allowSkip ? 'auto' : 'none';

      // Set skip click handler if permitted
      if (allowSkip) {
        const skipHandler = (e) => {
          e.stopPropagation();
          nextVideo.removeEventListener('click', skipHandler);
          this.skip();
        };
        nextVideo.addEventListener('click', skipHandler, { once: true });
      }

      const startPlayback = async () => {
        try {
          await nextVideo.play();
          // Fade in new video
          nextVideo.style.opacity = '1';

          // Fade out old video
          if (currentVideo && currentVideo !== nextVideo) {
            currentVideo.style.opacity = '0';
            setTimeout(() => {
              if (currentVideo !== this.videoElements[this.activeVideoIndex]) {
                currentVideo.pause();
                currentVideo.src = '';
              }
            }, fadeOut);
          }

          this.activeVideoIndex = nextIndex;
          if (this.wrapper) this.wrapper.style.backgroundColor = '#000000';
        } catch (err) {
          console.warn(`[VideoPlayer] Autoplay error for '${src}':`, err);
          // Auto fallback to muted play or graceful finish
          nextVideo.muted = true;
          try {
            await nextVideo.play();
            nextVideo.style.opacity = '1';
            this.activeVideoIndex = nextIndex;
          } catch (err2) {
            console.error(`[VideoPlayer] Video playback completely blocked:`, err2);
            this._handleVideoEnded(nextVideo, true);
          }
        }
      };

      // Ensure readyState or load
      if (nextVideo.readyState >= 2) {
        startPlayback();
      } else {
        nextVideo.addEventListener('canplay', () => startPlayback(), { once: true });
        nextVideo.load();
      }
    });
  }

  _checkCues(currentTime, duration) {
    if (this.currentOptions?.onProgress) {
      this.currentOptions.onProgress(currentTime, duration);
    }

    if (!this.activeCues || this.activeCues.length === 0) return;

    this.activeCues.forEach((cue, index) => {
      if (!this.firedCues.has(index) && currentTime >= cue.time) {
        this.firedCues.add(index);
        try {
          if (typeof cue.callback === 'function') {
            cue.callback(currentTime);
          }
        } catch (e) {
          console.error('[VideoPlayer] Cue callback error:', e);
        }
      }
    });
  }

  _handleVideoEnded(video, hasError = false) {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    if (!this.isPlaying) return;
    this.isPlaying = false;

    const fadeOut = this.currentOptions?.fadeOut || 300;
    video.style.transition = `opacity ${fadeOut}ms ease-in-out`;
    video.style.opacity = '0';
    if (this.wrapper) this.wrapper.style.backgroundColor = 'transparent';

    setTimeout(() => {
      video.pause();
      if (this.currentResolve) {
        const res = this.currentResolve;
        this.currentResolve = null;
        res(!hasError);
      }
    }, fadeOut);
  }

  /**
   * Skip current video immediately with smooth fade
   */
  skip() {
    if (!this.isPlaying) return;
    const currentVideo = this.videoElements[this.activeVideoIndex];
    if (currentVideo) {
      this._handleVideoEnded(currentVideo, false);
    }
  }

  /**
   * Stop video immediately
   */
  stop(fade = true) {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    this.isPlaying = false;
    if (this.wrapper) this.wrapper.style.backgroundColor = 'transparent';
    this.videoElements.forEach(v => {
      if (fade) {
        v.style.opacity = '0';
        setTimeout(() => {
          v.pause();
          v.currentTime = 0;
        }, 200);
      } else {
        v.style.opacity = '0';
        v.pause();
        v.currentTime = 0;
      }
    });

    if (this.currentResolve) {
      const res = this.currentResolve;
      this.currentResolve = null;
      res(false);
    }
  }

  pause() {
    const currentVideo = this.videoElements[this.activeVideoIndex];
    if (currentVideo && !currentVideo.paused) {
      currentVideo.pause();
    }
  }

  resume() {
    const currentVideo = this.videoElements[this.activeVideoIndex];
    if (currentVideo && currentVideo.paused) {
      currentVideo.play().catch(e => console.warn('[VideoPlayer] Resume failed:', e));
    }
  }

  setVolume(volume) {
    this.options.volume = Math.max(0, Math.min(1, volume));
    this.videoElements.forEach(v => {
      v.volume = this.options.volume;
    });
  }

  setMute(isMuted) {
    this.options.muted = !!isMuted;
    this.videoElements.forEach(v => {
      v.muted = this.options.muted;
    });
  }

  destroy() {
    this.stop(false);
    if (this.wrapper && this.wrapper.parentElement) {
      this.wrapper.parentElement.removeChild(this.wrapper);
    }
    this.videoElements = [];
  }
}

export default VideoPlayer;
