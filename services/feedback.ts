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

  public async reset() {
    console.log('[Feedback] Resetting AudioContext...');
    // Explicitly close and nullify context to simulate "fresh start"
    if (this.audioContext) {
        const ctx = this.audioContext;
        this.audioContext = null;
        try { 
            if (ctx.state !== 'closed') await ctx.close(); 
        } catch (e) {
            console.warn('[Feedback] Close failed', e);
        }
    }
    console.log('[Feedback] AudioContext reset complete');
  }

  public initAudio() {
    // Check if context is dead (closed or interrupted) and needs recreation
    if (this.audioContext && (this.audioContext.state === 'closed' || (this.audioContext as any).state === 'interrupted')) {
      console.log('[Feedback] Context dead, clearing...');
      this.audioContext = null;
    }

    if (this.isSoundEnabled && !this.audioContext) {
      try {
        console.log('[Feedback] Creating new AudioContext...');
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          // Use interactive latency hint
          this.audioContext = new AudioContextClass({ latencyHint: 'interactive' });
          console.log('[Feedback] AudioContext created, state:', this.audioContext.state);
        }
      } catch (e) {
        console.error('[Feedback] Failed to create AudioContext', e);
      }
    }
    
    // Attempt to resume if suspended
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  private isResuming: boolean = false;

  // ... constructor ...

  public async resumeContext() {
    if (!this.isSoundEnabled) return;
    if (this.isResuming) return; // Prevent concurrent resume attempts
    
    this.isResuming = true;
    try {
        // If context is missing (was reset), this will create a NEW one.
        if (!this.audioContext || this.audioContext.state === 'closed' || (this.audioContext as any).state === 'interrupted') {
            console.log('[Feedback] resumeContext: Init needed');
            this.initAudio();
        }

        // Try Silent Buffer Unlock - often more effective than Oscillator for "waking up"
        this.unlockAudio();

        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                console.log('[Feedback] Resuming suspended context...');
                
                // Race resume() against a timeout
                const resumePromise = this.audioContext.resume();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 600));
                
                await Promise.race([resumePromise, timeoutPromise]);
                
                console.log('[Feedback] Resume success, state:', this.audioContext.state);
            } catch (e: any) {
                if (e.message === 'TIMEOUT') {
                    console.warn('[Feedback] Resume timed out! Context is zombie. Destroying...');
                    this.forceRecreate(); 
                    // Do NOT create new context here. Wait for next user interaction.
                    console.log('[Feedback] Context destroyed. Waiting for next interaction to recreate.');
                } else {
                    console.warn('[Feedback] Manual resume failed', e);
                }
            }
        }
    } finally {
        this.isResuming = false;
    }
  }

  public unlockAudio() {
    if (!this.audioContext || this.audioContext.state === 'closed') return;
    try {
        // Create an empty 1-sample buffer
        const buffer = this.audioContext.createBuffer(1, 1, 22050);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        // Play it immediately
        source.start(0);
        
        // Resume again just in case (fire and forget)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
    } catch (e) {
        console.warn('[Feedback] Unlock audio failed', e);
    }
  }

  public forceRecreate() {
    if (this.audioContext) {
        try { this.audioContext.close(); } catch (e) {}
        this.audioContext = null;
    }
    // CRITICAL: Do NOT call initAudio() here. 
    // It must be called inside a user gesture (resumeContext).
  }

  public warmUp() {
    this.resumeContext();
  }

  public play(type: 'click' | 'delete' | 'success' | 'error' | 'undo' | 'switch') {
    if (!this.isSoundEnabled) return;

    this.initAudio();
    if (!this.audioContext) return;

    // Ensure context is running, but don't block or reset on failure
    if (this.audioContext.state === 'suspended') {
        this.unlockAudio(); // Try unlocking again
        this.audioContext.resume().catch(() => {});
    }

    try {
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

          case 'undo':
            // Rising tone, "whoop"
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

          case 'switch':
            // Very short, light tick
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
            gain.gain.setValueAtTime(0.1, now); // Quiet
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
            osc.start(now);
            osc.stop(now + 0.03);
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
    } catch (e) {
        console.error('[Feedback] Audio playback failed', e);
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
