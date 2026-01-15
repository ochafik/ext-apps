/**
 * Text-to-Speech hook with Pocket TTS support and Web Speech API fallback.
 * Adapted from voice-assist project.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  getStreamingWavPlayer,
  type TTSSettings,
} from "../utils/streamingWavPlayer";

export type { TTSSettings } from "../utils/streamingWavPlayer";

// TTS server configuration - provided by server via host context or env
const TTS_SERVER_URL =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.VITE_TTS_SERVER_URL || "http://localhost:8880";

// Pocket TTS available voices
const POCKET_TTS_VOICES = [
  "cosette",
  "sarah",
  "allison",
  "angie",
  "brenda",
  "carley",
  "damien",
  "dustin",
  "joe",
  "kendra",
  "kenny",
  "sonia",
];

interface SpeakOptions {
  voice?: SpeechSynthesisVoice | null;
  startFromChar?: number;
  onStart?: () => void;
  onBoundary?: (charIndex: number) => void;
  onEnd?: (completed: boolean, finalCharIndex: number) => void;
}

interface UseSpeechSynthesisReturn {
  speak: (text: string, options?: SpeakOptions) => void;
  stop: () => void;
  isSpeaking: boolean;
  availableVoices: SpeechSynthesisVoice[];
  volume: number;
  setVolume: (v: number) => void;
  isMuted: boolean;
  setMuted: (m: boolean) => void;
  pocketTTSAvailable: boolean | null;
  ttsSettings: TTSSettings;
  setTTSSettings: (settings: TTSSettings) => void;
}

/**
 * Find word boundary for clean speech resume.
 */
function findWordBoundary(text: string, charIndex: number): number {
  if (charIndex <= 0) return 0;
  if (charIndex >= text.length) return text.length;
  if (text[charIndex] === " ") return charIndex + 1;
  if (charIndex > 0 && text[charIndex - 1] === " ") return charIndex;
  const prevSpace = text.lastIndexOf(" ", charIndex - 1);
  return prevSpace > 0 ? prevSpace + 1 : 0;
}

/**
 * Create a SpeechSynthesisVoice-like object for pocket_tts voices.
 */
function createPocketVoice(name: string): SpeechSynthesisVoice {
  return {
    name: `Pocket TTS - ${name.charAt(0).toUpperCase() + name.slice(1)}`,
    lang: "en-US",
    default: name === "cosette",
    localService: false,
    voiceURI: `pocket-tts:${name}`,
  };
}

/**
 * Check if a voice is a pocket_tts voice.
 */
function isPocketVoice(voice: SpeechSynthesisVoice | null | undefined): boolean {
  return voice?.voiceURI?.startsWith("pocket-tts:") || false;
}

/**
 * Extract pocket_tts voice name from voiceURI.
 */
function getPocketVoiceName(voice: SpeechSynthesisVoice): string {
  return voice.voiceURI.replace("pocket-tts:", "");
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [volume, setVolume] = useState(1);
  const [isMuted, setMuted] = useState(false);
  const [pocketTTSAvailable, setPocketTTSAvailable] = useState<boolean | null>(null);
  const [ttsSettings, setTTSSettings] = useState<TTSSettings>({});

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakFromRef = useRef(0);
  const lastCharIndexRef = useRef(0);
  const lastBoundaryRef = useRef(-1);
  const wasCancelledRef = useRef(false);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  const ttsSettingsRef = useRef(ttsSettings);
  const playerRef = useRef(getStreamingWavPlayer());
  const currentTextRef = useRef("");

  // Keep refs in sync
  volumeRef.current = volume;
  isMutedRef.current = isMuted;
  ttsSettingsRef.current = ttsSettings;

  // Check pocket_tts availability on mount
  useEffect(() => {
    const checkPocketTTS = async () => {
      try {
        const response = await fetch(`${TTS_SERVER_URL}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const data = await response.json();
          setPocketTTSAvailable(data.status === "healthy");
          console.log("[TTS] Pocket TTS available:", data.status === "healthy");
        } else {
          setPocketTTSAvailable(false);
        }
      } catch {
        console.log("[TTS] Pocket TTS not available, using Web Speech API");
        setPocketTTSAvailable(false);
      }
    };

    checkPocketTTS();
  }, []);

  // Load voices (merge pocket_tts + native)
  useEffect(() => {
    const loadVoices = () => {
      // Start with pocket_tts voices if available
      const pocketVoices = pocketTTSAvailable ? POCKET_TTS_VOICES.map(createPocketVoice) : [];

      // Add native voices
      if (typeof speechSynthesis !== "undefined") {
        const nativeVoices = speechSynthesis.getVoices();
        const englishVoices = nativeVoices.filter((v) => v.lang.startsWith("en"));
        const otherVoices = nativeVoices.filter((v) => !v.lang.startsWith("en"));
        setAvailableVoices([...pocketVoices, ...englishVoices, ...otherVoices]);
      } else {
        setAvailableVoices(pocketVoices);
      }
    };

    loadVoices();
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [pocketTTSAvailable]);

  // Cleanup on unmount
  useEffect(() => {
    const cleanup = () => {
      playerRef.current.stop();
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.cancel();
      }
    };

    window.addEventListener("beforeunload", cleanup);
    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, []);

  // Update player volume when volume/mute changes
  useEffect(() => {
    playerRef.current.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  /**
   * Speak using pocket_tts server.
   */
  const speakWithPocketTTS = useCallback(
    (text: string, speakFrom: number, options?: SpeakOptions) => {
      const player = playerRef.current;
      const textToSpeak = text.slice(speakFrom);
      const voiceName =
        options?.voice && isPocketVoice(options.voice)
          ? getPocketVoiceName(options.voice)
          : "cosette"; // Default voice

      currentTextRef.current = text;
      speakFromRef.current = speakFrom;
      lastCharIndexRef.current = speakFrom;
      lastBoundaryRef.current = -1;

      player.setVolume(isMutedRef.current ? 0 : volumeRef.current);

      player
        .play(
          TTS_SERVER_URL,
          textToSpeak,
          voiceName,
          {
            onStart: () => {
              console.log("[TTS] Started speaking (pocket_tts)");
              options?.onStart?.();
            },
            onProgress: (elapsed, total) => {
              if (wasCancelledRef.current) return;

              // Estimate character position from elapsed time
              const ratio = Math.min(elapsed / total, 1);
              const estimatedCharInSlice = Math.floor(ratio * textToSpeak.length);
              const absoluteIndex = speakFrom + estimatedCharInSlice;

              // Find word boundary for smooth highlighting
              const wordBoundary = findWordBoundary(text, absoluteIndex);

              // Only emit if boundary changed
              if (wordBoundary !== lastBoundaryRef.current) {
                lastBoundaryRef.current = wordBoundary;
                lastCharIndexRef.current = wordBoundary;
                options?.onBoundary?.(wordBoundary);
              }
            },
            onEnd: (completed) => {
              setIsSpeaking(false);
              if (!wasCancelledRef.current) {
                options?.onEnd?.(completed, completed ? text.length : lastCharIndexRef.current);
              }
            },
          },
          ttsSettingsRef.current,
        )
        .catch((error) => {
          console.error("[TTS] pocket_tts error:", error);
          setIsSpeaking(false);
          if (!wasCancelledRef.current) {
            options?.onEnd?.(false, lastCharIndexRef.current);
          }
        });
    },
    [],
  );

  /**
   * Speak using native SpeechSynthesis (fallback).
   */
  const speakWithNative = useCallback(
    (text: string, speakFrom: number, options?: SpeakOptions) => {
      if (typeof speechSynthesis === "undefined") {
        options?.onEnd?.(false, 0);
        return;
      }

      const textToSpeak = text.slice(speakFrom);
      if (!textToSpeak.trim()) return;

      speakFromRef.current = speakFrom;
      lastCharIndexRef.current = speakFrom;

      const utterance = new SpeechSynthesisUtterance(textToSpeak);

      // Only use native voices for native synthesis
      if (options?.voice && !isPocketVoice(options.voice)) {
        utterance.voice = options.voice;
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = isMutedRef.current ? 0 : volumeRef.current;

      utterance.onstart = () => {
        console.log("[TTS] Started speaking (native)");
        options?.onStart?.();
      };

      utterance.onboundary = (event) => {
        if (event.name === "word") {
          const absoluteIndex = speakFrom + event.charIndex + (event.charLength || 0);
          lastCharIndexRef.current = absoluteIndex;
          options?.onBoundary?.(absoluteIndex);
        }
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        if (!wasCancelledRef.current) {
          options?.onEnd?.(true, text.length);
        }
      };

      utterance.onerror = (event) => {
        setIsSpeaking(false);
        if (event.error === "canceled" || event.error === "interrupted") {
          return;
        }
        console.error("[TTS] Error:", event.error);
        options?.onEnd?.(false, lastCharIndexRef.current);
      };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    },
    [],
  );

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      // Cancel any current speech
      wasCancelledRef.current = true;
      playerRef.current.stop();
      if (typeof speechSynthesis !== "undefined") {
        speechSynthesis.cancel();
      }
      wasCancelledRef.current = false;

      // Handle empty text - still call onEnd to not block the queue
      if (!text.trim()) {
        options?.onEnd?.(true, 0);
        return;
      }

      const startFrom = options?.startFromChar ?? 0;
      const speakFrom = findWordBoundary(text, startFrom);
      const textToSpeak = text.slice(speakFrom);

      // Handle nothing left to speak - still call onEnd to not block the queue
      if (!textToSpeak.trim()) {
        options?.onEnd?.(true, text.length);
        return;
      }

      setIsSpeaking(true);

      // Decide whether to use pocket_tts or native
      const usePocketTTS = pocketTTSAvailable && (!options?.voice || isPocketVoice(options.voice));

      if (usePocketTTS) {
        speakWithPocketTTS(text, speakFrom, options);
      } else {
        speakWithNative(text, speakFrom, options);
      }
    },
    [pocketTTSAvailable, speakWithPocketTTS, speakWithNative],
  );

  const stop = useCallback(() => {
    console.log("[TTS] Stopping");
    wasCancelledRef.current = true;
    playerRef.current.stop();
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    availableVoices,
    volume,
    setVolume,
    isMuted,
    setMuted,
    pocketTTSAvailable,
    ttsSettings,
    setTTSSettings,
  };
}
