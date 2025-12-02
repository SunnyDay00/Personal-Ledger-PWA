export class FeedbackService {
  private static instance: FeedbackService;
  private audioContext: AudioContext | null = null;
  private isSoundEnabled: boolean = true;
  private isHapticsEnabled: boolean = true;

  private constructor() {}

  public static getInstance(): FeedbackService {
    if (!FeedbackService.instance) {
      FeedbackService.instance = new FeedbackService();
    }
    return FeedbackService.instance;
  }

  public updateSettings(sound: boolean, haptics: boolean) {
    this.isSoundEnabled = sound;
    this.isHapticsEnabled = haptics;
  }

  public initAudio() {
    if (this.isSoundEnabled && !this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
    // Resume context if suspended (browser policy)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  public warmUp() {
    if (!this.isSoundEnabled) return;
    this.initAudio();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  public play(type: 'click' | 'delete' | 'success' | 'error') {
    if (!this.isSoundEnabled) {
        // console.log('[Feedback] Play skipped: Sound disabled');
        return;
    }
    this.initAudio();
    if (!this.audioContext) {
        // console.log('[Feedback] Play skipped: No AudioContext');
        return;
    }
    
    // Ensure context is running (for autoplay policy)
    if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
    }

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    const now = this.audioContext.currentTime;

    switch (type) {
      case 'click':
        // Crisp, short click (high pitch, fast decay)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;

      case 'delete':
        // Lower pitch, thud-like
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;

      case 'success':
        // Pleasant ascending chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;

      case 'error':
        // Dissonant buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
    }
  }

  public vibrate(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
    if (!this.isHapticsEnabled || typeof navigator === 'undefined' || !navigator.vibrate) return;

    switch (type) {
      case 'light':
        navigator.vibrate(10); // Very short tick
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'heavy':
        navigator.vibrate(40);
        break;
      case 'success':
        navigator.vibrate([10, 30, 20]); // Da-da
        break;
      case 'error':
        navigator.vibrate([50, 30, 50]); // Buzz-buzz
        break;
    }
  }
}

export const feedback = FeedbackService.getInstance();
