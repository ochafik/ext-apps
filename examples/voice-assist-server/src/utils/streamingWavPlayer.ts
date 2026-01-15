/**
 * Streaming WAV player for pocket_tts audio.
 * Fetches audio from the TTS server and plays it using Web Audio API.
 */

export interface StreamingWavPlayerOptions {
  onStart?: () => void;
  onProgress?: (elapsedSeconds: number, totalSeconds: number) => void;
  onEnd?: (completed: boolean) => void;
}

/**
 * TTS generation settings (passed to pocket_tts server).
 */
export interface TTSSettings {
  temperature?: number; // Sampling temperature (default: 0.9)
  lsdDecodeSteps?: number; // LSD decoding steps (default: 1)
  noiseClamp?: number; // Noise clamp value (default: 3.0)
  eosThreshold?: number; // EOS detection threshold (default: -4.0)
}

export class StreamingWavPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private abortController: AbortController | null = null;
  private progressInterval: number | null = null;
  private startTime: number = 0;
  private duration: number = 0;
  private volume: number = 1;
  private options: StreamingWavPlayerOptions = {};

  constructor() {
    // AudioContext created lazily on first play
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;
    }
    return this.audioContext;
  }

  /**
   * Play audio from a TTS server endpoint.
   */
  async play(
    serverUrl: string,
    text: string,
    voice?: string,
    options?: StreamingWavPlayerOptions,
    settings?: TTSSettings,
  ): Promise<void> {
    // Stop any current playback
    this.stop();

    this.options = options || {};
    this.abortController = new AbortController();

    const ctx = this.ensureAudioContext();

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    try {
      // Build form data for request
      const formData = new FormData();
      formData.append("text", text);
      if (voice) {
        formData.append("voice_url", voice);
      }
      // Add TTS settings if provided
      if (settings?.temperature !== undefined) {
        formData.append("temperature", settings.temperature.toString());
      }
      if (settings?.lsdDecodeSteps !== undefined) {
        formData.append("lsd_decode_steps", settings.lsdDecodeSteps.toString());
      }
      if (settings?.noiseClamp !== undefined) {
        formData.append("noise_clamp", settings.noiseClamp.toString());
      }
      if (settings?.eosThreshold !== undefined) {
        formData.append("eos_threshold", settings.eosThreshold.toString());
      }

      // Fetch audio from server
      const response = await fetch(`${serverUrl}/tts`, {
        method: "POST",
        body: formData,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS server error: ${response.status}`);
      }

      // Get the audio data
      const arrayBuffer = await response.arrayBuffer();

      // Check if we were aborted during fetch
      if (this.abortController?.signal.aborted) {
        return;
      }

      // Decode WAV to audio buffer
      const audioBuffer = await this.decodeWavBuffer(ctx, arrayBuffer);

      // Check if we were aborted during decode
      if (this.abortController?.signal.aborted) {
        return;
      }

      this.duration = audioBuffer.duration;

      // Create and start source node
      this.sourceNode = ctx.createBufferSource();
      this.sourceNode.buffer = audioBuffer;
      this.sourceNode.connect(this.gainNode!);

      // Handle playback end
      this.sourceNode.onended = () => {
        this.cleanup();
        // Only call onEnd if not aborted
        if (!this.abortController?.signal.aborted) {
          this.options.onEnd?.(true);
        }
      };

      // Start playback
      this.startTime = ctx.currentTime;
      this.sourceNode.start();

      // Fire onStart callback
      this.options.onStart?.();

      // Start progress tracking
      this.startProgressTracking();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Playback was stopped, don't call onEnd
        return;
      }
      this.cleanup();
      this.options.onEnd?.(false);
      throw error;
    }
  }

  /**
   * Decode WAV array buffer to AudioBuffer.
   */
  private async decodeWavBuffer(
    ctx: AudioContext,
    arrayBuffer: ArrayBuffer,
  ): Promise<AudioBuffer> {
    // Try native decode first (handles most WAV formats)
    try {
      return await ctx.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      // Fall back to manual WAV parsing if native decode fails
      return this.parseWavManually(ctx, arrayBuffer);
    }
  }

  /**
   * Parse WAV file manually (fallback for non-standard headers).
   */
  private parseWavManually(ctx: AudioContext, arrayBuffer: ArrayBuffer): AudioBuffer {
    const view = new DataView(arrayBuffer);

    // Read WAV header
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    if (riff !== "RIFF") {
      throw new Error("Invalid WAV: missing RIFF header");
    }

    // fmt chunk
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);

    // Find data chunk
    let dataOffset = 44; // Standard position
    let dataSize = view.getUint32(40, true);

    // Handle non-standard headers by searching for 'data' marker
    for (let i = 36; i < Math.min(arrayBuffer.byteLength - 8, 1000); i++) {
      if (
        view.getUint8(i) === 0x64 && // 'd'
        view.getUint8(i + 1) === 0x61 && // 'a'
        view.getUint8(i + 2) === 0x74 && // 't'
        view.getUint8(i + 3) === 0x61 // 'a'
      ) {
        dataSize = view.getUint32(i + 4, true);
        dataOffset = i + 8;
        break;
      }
    }

    // Calculate number of samples
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = Math.floor(dataSize / (numChannels * bytesPerSample));

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(numChannels, numSamples, sampleRate);

    // Read samples
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < numSamples; i++) {
        const sampleOffset = dataOffset + (i * numChannels + channel) * bytesPerSample;
        if (bitsPerSample === 16) {
          const sample = view.getInt16(sampleOffset, true);
          channelData[i] = sample / 32768;
        } else if (bitsPerSample === 8) {
          const sample = view.getUint8(sampleOffset);
          channelData[i] = (sample - 128) / 128;
        }
      }
    }

    return audioBuffer;
  }

  /**
   * Start tracking playback progress.
   */
  private startProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }

    // Update progress every 50ms
    this.progressInterval = window.setInterval(() => {
      if (!this.audioContext || !this.sourceNode) {
        return;
      }

      const elapsed = this.audioContext.currentTime - this.startTime;
      if (elapsed <= this.duration) {
        this.options.onProgress?.(elapsed, this.duration);
      }
    }, 50);
  }

  /**
   * Stop playback.
   */
  stop(): void {
    // Signal abort to cancel any pending fetch
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Stop the source node
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // Ignore errors if already stopped
      }
      this.sourceNode = null;
    }

    this.cleanup();
  }

  /**
   * Clean up progress tracking.
   */
  private cleanup(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  /**
   * Set playback volume.
   */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  /**
   * Get current volume.
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Check if audio context is available.
   */
  static isSupported(): boolean {
    return (
      typeof AudioContext !== "undefined" ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (window as any).webkitAudioContext !== "undefined"
    );
  }
}

// Singleton instance for reuse
let playerInstance: StreamingWavPlayer | null = null;

export function getStreamingWavPlayer(): StreamingWavPlayer {
  if (!playerInstance) {
    playerInstance = new StreamingWavPlayer();
  }
  return playerInstance;
}
