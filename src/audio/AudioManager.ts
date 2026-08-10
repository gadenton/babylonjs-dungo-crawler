import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export type AudioBus = "master" | "music" | "sfx" | "ui";

export class AudioManager {
  private audioCtx: AudioContext | null = null;

  // Bus Gain Nodes
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;
  private musicDuckingGain: GainNode | null = null;

  // Volume States (in Decibels)
  private busVolumes: Record<AudioBus, number> = {
    master: 0,
    music: -6,
    sfx: 0,
    ui: -3,
  };

  // Sound Buffers Cache
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private isUnlocked: boolean = false;

  // Sidechain Ducking Timer
  private duckingReleaseTimer: number | null = null;

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtxClass) return;

    try {
      this.audioCtx = new AudioCtxClass();

      // Create Gain Nodes
      this.masterGain = this.audioCtx.createGain();
      this.musicGain = this.audioCtx.createGain();
      this.musicDuckingGain = this.audioCtx.createGain();
      this.sfxGain = this.audioCtx.createGain();
      this.uiGain = this.audioCtx.createGain();

      // Node Hierarchy Routing:
      // Music -> MusicDucking -> Master
      this.musicGain.connect(this.musicDuckingGain);
      this.musicDuckingGain.connect(this.masterGain);

      // SFX -> Master
      this.sfxGain.connect(this.masterGain);

      // UI -> Master
      this.uiGain.connect(this.masterGain);

      // Master -> Destination
      this.masterGain.connect(this.audioCtx.destination);

      // Apply initial volumes in decibels
      this.applyBusVolumes();

      // Setup unlock listener for browser autoplay policy
      this.setupUnlockListener();
    } catch (e) {
      console.warn("[AudioManager] Failed to initialize AudioContext:", e);
    }
  }

  private setupUnlockListener(): void {
    const unlock = () => {
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else {
        this.isUnlocked = true;
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
  }

  public ensureContextResumed(): void {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
  }

  // --- Decibel Math Utilities ---
  public dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }

  public linearToDb(gain: number): number {
    return 20 * Math.log10(Math.max(gain, 0.0001));
  }

  public setBusVolumeDb(bus: AudioBus, db: number): void {
    this.busVolumes[bus] = db;
    this.applyBusVolumes();
  }

  public getBusVolumeDb(bus: AudioBus): number {
    return this.busVolumes[bus];
  }

  // Helper setter methods for backwards compatibility
  public setMasterVolume(vol: number): void {
    this.setBusVolumeDb("master", this.linearToDb(vol));
  }

  public setMusicVolume(vol: number): void {
    this.setBusVolumeDb("music", this.linearToDb(vol));
  }

  public setSFXVolume(vol: number): void {
    this.setBusVolumeDb("sfx", this.linearToDb(vol));
  }

  public setUIVolume(vol: number): void {
    this.setBusVolumeDb("ui", this.linearToDb(vol));
  }

  private applyBusVolumes(): void {
    if (!this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    if (this.masterGain) this.masterGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.master), now, 0.01);
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.music), now, 0.01);
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.sfx), now, 0.01);
    if (this.uiGain) this.uiGain.gain.setTargetAtTime(this.dbToLinear(this.busVolumes.ui), now, 0.01);
  }

  // --- 3D Spatial Audio & Listener Tracking ---
  public updateListener(position: Vector3, forward: Vector3 = new Vector3(0, 0, 1), up: Vector3 = Vector3.Up()): void {
    if (!this.audioCtx || !this.audioCtx.listener) return;

    const listener = this.audioCtx.listener;
    const now = this.audioCtx.currentTime;

    if (listener.positionX) {
      listener.positionX.setValueAtTime(position.x, now);
      listener.positionY.setValueAtTime(position.y, now);
      listener.positionZ.setValueAtTime(position.z, now);
      listener.forwardX.setValueAtTime(forward.x, now);
      listener.forwardY.setValueAtTime(forward.y, now);
      listener.forwardZ.setValueAtTime(forward.z, now);
      listener.upX.setValueAtTime(up.x, now);
      listener.upY.setValueAtTime(up.y, now);
      listener.upZ.setValueAtTime(up.z, now);
    } else if ((listener as any).setPosition) {
      (listener as any).setPosition(position.x, position.y, position.z);
      (listener as any).setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Sidechain ducking: drops music volume temporarily on heavy combat impacts */
  public triggerSidechainDucking(duckDb: number = -10, durationMs: number = 350): void {
    if (!this.audioCtx || !this.musicDuckingGain) return;
    this.ensureContextResumed();

    const now = this.audioCtx.currentTime;
    const duckedLinear = this.dbToLinear(duckDb);

    // Fast Attack (15ms)
    this.musicDuckingGain.gain.setTargetAtTime(duckedLinear, now, 0.015);

    if (this.duckingReleaseTimer !== null) {
      clearTimeout(this.duckingReleaseTimer);
    }

    // Smooth Release (300ms) after durationMs
    this.duckingReleaseTimer = window.setTimeout(() => {
      if (this.audioCtx && this.musicDuckingGain) {
        const releaseTime = this.audioCtx.currentTime;
        this.musicDuckingGain.gain.setTargetAtTime(1.0, releaseTime, 0.3);
      }
      this.duckingReleaseTimer = null;
    }, durationMs);
  }

  // Alias for backward compatibility
  public duckMusic(durationMs: number = 300, duckDb: number = -10): void {
    this.triggerSidechainDucking(duckDb, durationMs);
  }

  /** Play 2D Non-Spatial Sound (with synthetic oscillator fallback) */
  public playSound(soundKey: string, bus: AudioBus = "sfx", pitchVariance: number = 0.05): void {
    if (!this.audioCtx) return;
    this.ensureContextResumed();

    const buffer = this.audioBuffers.get(soundKey);
    if (!buffer) {
      this.playSyntheticBeep(bus);
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    if (pitchVariance > 0) {
      source.playbackRate.value = 1.0 + (Math.random() - 0.5) * 2 * pitchVariance;
    }

    const busNode = this.getBusNode(bus);
    if (busNode) {
      source.connect(busNode);
      source.onended = () => {
        source.disconnect();
      };
      source.start();
    }
  }

  /** Play 3D Spatial Sound at World Position */
  public playSpatialSound(soundKey: string, position: Vector3, pitchVariance: number = 0.05): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();

    const buffer = this.audioBuffers.get(soundKey);
    if (!buffer) {
      this.playSyntheticSpatialBeep(position);
      return;
    }

    const source = this.audioCtx.createBufferSource();
    source.buffer = buffer;

    if (pitchVariance > 0) {
      source.playbackRate.value = 1.0 + (Math.random() - 0.5) * 2 * pitchVariance;
    }

    const panner = this.audioCtx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3.0;
    panner.maxDistance = 50.0;
    panner.rolloffFactor = 1.0;

    panner.positionX.setValueAtTime(position.x, this.audioCtx.currentTime);
    panner.positionY.setValueAtTime(position.y, this.audioCtx.currentTime);
    panner.positionZ.setValueAtTime(position.z, this.audioCtx.currentTime);

    source.connect(panner);
    panner.connect(this.sfxGain);
    source.onended = () => {
      source.disconnect();
      panner.disconnect();
    };
    source.start();
  }

  /** Synthesized fallback methods for testing combat actions */
  public playHitSFX(position?: Vector3, isCrit: boolean = false): void {
    if (position) {
      this.playSyntheticSpatialBeep(position, isCrit);
    } else {
      this.playSyntheticBeep("sfx", isCrit);
    }

    if (isCrit) {
      this.triggerSidechainDucking(-12, 350);
    }
  }

  public playSkillSFX(position?: Vector3, duckDb: number = -10, durationMs: number = 350): void {
    if (position) {
      this.playSyntheticSpatialBeep(position, true);
    } else {
      this.playSyntheticBeep("sfx", true);
    }
    this.triggerSidechainDucking(duckDb, durationMs);
  }

  public playSwingSFX(): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playGoldPickupSFX(position?: Vector3): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.1);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playGlobePickupSFX(position?: Vector3): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playItemPickupSFX(position?: Vector3): void {
    if (!this.audioCtx || !this.sfxGain) return;
    this.ensureContextResumed();
    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(659, now + 0.05);
    osc.frequency.setValueAtTime(783, now + 0.1);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + 0.18);
  }

  private playSyntheticBeep(bus: AudioBus, isCrit: boolean = false): void {
    if (!this.audioCtx) return;
    const busNode = this.getBusNode(bus);
    if (!busNode) return;

    const now = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = isCrit ? "sawtooth" : "sine";
    osc.frequency.setValueAtTime(isCrit ? 350 : 220, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + (isCrit ? 0.2 : 0.1));

    gain.gain.setValueAtTime(isCrit ? 0.5 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.2 : 0.1));

    osc.connect(gain);
    gain.connect(busNode);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(now);
    osc.stop(now + (isCrit ? 0.2 : 0.1));
  }

  private playSyntheticSpatialBeep(position: Vector3, isCrit: boolean = false): void {
    if (!this.audioCtx || !this.sfxGain) return;
    const now = this.audioCtx.currentTime;

    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const panner = this.audioCtx.createPanner();

    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 3.0;
    panner.maxDistance = 50.0;
    panner.rolloffFactor = 1.0;

    panner.positionX.setValueAtTime(position.x, now);
    panner.positionY.setValueAtTime(position.y, now);
    panner.positionZ.setValueAtTime(position.z, now);

    osc.type = isCrit ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(isCrit ? 350 : 220, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + (isCrit ? 0.2 : 0.12));

    gain.gain.setValueAtTime(isCrit ? 0.5 : 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.2 : 0.12));

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(this.sfxGain);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
    };

    osc.start(now);
    osc.stop(now + (isCrit ? 0.2 : 0.12));
  }

  private getBusNode(bus: AudioBus): GainNode | null {
    switch (bus) {
      case "master":
        return this.masterGain;
      case "music":
        return this.musicGain;
      case "sfx":
        return this.sfxGain;
      case "ui":
        return this.uiGain;
    }
  }

  public dispose(): void {
    if (this.duckingReleaseTimer !== null) clearTimeout(this.duckingReleaseTimer);
    if (this.audioCtx) this.audioCtx.close();
  }
}
