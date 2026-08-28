import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import * as Speech from "expo-speech";

import { synthesizeCloudSpeech } from "./cloudTextToSpeech";
import useAppSettings from "./settings";

const TARGET_CHUNK_LENGTH = 1_200;

let ttsAudioModePromise: Promise<void> | null = null;

function ensureTTSAudioMode() {
  ttsAudioModePromise ??= setAudioModeAsync({
    playsInSilentMode: true,
  }).catch((error: unknown) => {
    ttsAudioModePromise = null;
    throw error;
  });
  return ttsAudioModePromise;
}

export type SpeechStatus = "idle" | "loading" | "playing" | "paused";

function splitOversizedPart(part: string, maxLength: number) {
  const chunks: string[] = [];
  let remaining = part.trim();

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < maxLength / 2) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

export function chunkArticleText(
  text: string,
  maxLength = TARGET_CHUNK_LENGTH,
) {
  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const parts = normalized.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const rawPart of parts) {
    for (const part of splitOversizedPart(rawPart, maxLength)) {
      const candidate = current ? `${current} ${part}` : part;
      if (candidate.length <= maxLength) {
        current = candidate;
      } else {
        if (current) chunks.push(current);
        current = part;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export function useTextToSpeech(text: string) {
  const { settings } = useAppSettings();
  const chunks = useMemo(() => chunkArticleText(text), [text]);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [rate, setRateState] = useState(1);
  const generationRef = useRef(0);
  const indexRef = useRef(0);
  const rateRef = useRef(1);
  const currentAudioFileRef = useRef<Awaited<
    ReturnType<typeof synthesizeCloudSpeech>
  > | null>(null);
  const usesCloudProvider = settings.ttsProvider !== "system";

  const removeCurrentAudioFile = useCallback(() => {
    const file = currentAudioFileRef.current;
    currentAudioFileRef.current = null;
    if (file?.exists) file.delete();
  }, []);

  const speakChunk = useCallback(
    async (index: number, generation: number) => {
      if (generation !== generationRef.current) return;
      const chunk = chunks[index];
      if (!chunk) {
        setStatus("idle");
        setChunkIndex(0);
        indexRef.current = 0;
        return;
      }

      indexRef.current = index;
      setChunkIndex(index);
      setError(null);
      try {
        await ensureTTSAudioMode();
      } catch (audioModeError) {
        if (generation === generationRef.current) {
          setError(
            audioModeError instanceof Error
              ? audioModeError.message
              : "Audio playback setup failed.",
          );
          setStatus("idle");
        }
        return;
      }
      if (!usesCloudProvider) {
        setStatus("playing");
        Speech.speak(chunk, {
          rate: rateRef.current,
          voice: settings.ttsVoiceIdentifier,
          onDone: () => void speakChunk(index + 1, generation),
          onError: (speechError) => {
            if (generation === generationRef.current) {
              setError(speechError.message || "Speech synthesis failed.");
              setStatus("idle");
            }
          },
        });
        return;
      }

      setStatus("loading");
      try {
        const file = await synthesizeCloudSpeech(chunk, settings);
        if (generation !== generationRef.current) {
          if (file.exists) file.delete();
          return;
        }
        player.pause();
        removeCurrentAudioFile();
        currentAudioFileRef.current = file;
        player.replace(file.uri);
        player.playbackRate = rateRef.current;
        player.play();
        setStatus("playing");
      } catch (speechError) {
        if (generation === generationRef.current) {
          setError(
            speechError instanceof Error
              ? speechError.message
              : "Speech synthesis failed.",
          );
          setStatus("idle");
        }
      }
    },
    [chunks, player, removeCurrentAudioFile, settings, usesCloudProvider],
  );

  const startAt = useCallback(
    async (index: number) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      await Speech.stop();
      player.pause();
      void speakChunk(
        Math.max(0, Math.min(index, chunks.length - 1)),
        generation,
      );
    },
    [chunks.length, player, speakChunk],
  );

  const play = useCallback(() => {
    if (!chunks.length) return;
    if (status === "paused" && usesCloudProvider) {
      player.play();
      setStatus("playing");
      return;
    }
    if (status === "paused" && Platform.OS === "ios") {
      void Speech.resume().then(() => setStatus("playing"));
      return;
    }
    void startAt(status === "idle" ? 0 : indexRef.current);
  }, [chunks.length, player, startAt, status, usesCloudProvider]);

  const pause = useCallback(() => {
    if (status !== "playing") return;
    if (usesCloudProvider) {
      player.pause();
      setStatus("paused");
      return;
    }
    if (Platform.OS === "ios") {
      void Speech.pause().then(() => setStatus("paused"));
    } else {
      // Android has no native pause. Stop and repeat the current short chunk
      // when playback resumes so no following text is skipped.
      generationRef.current += 1;
      void Speech.stop().then(() => setStatus("paused"));
    }
  }, [player, status, usesCloudProvider]);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    await Speech.stop();
    player.pause();
    if (player.isLoaded) await player.seekTo(0);
    removeCurrentAudioFile();
    indexRef.current = 0;
    setChunkIndex(0);
    setStatus("idle");
  }, [player, removeCurrentAudioFile]);

  const next = useCallback(() => {
    if (chunks.length)
      void startAt(Math.min(indexRef.current + 1, chunks.length - 1));
  }, [chunks.length, startAt]);

  const previous = useCallback(() => {
    if (chunks.length) void startAt(Math.max(indexRef.current - 1, 0));
  }, [chunks.length, startAt]);

  const setRate = useCallback(
    (newRate: number) => {
      rateRef.current = newRate;
      setRateState(newRate);
      if (usesCloudProvider) {
        player.playbackRate = newRate;
      } else if (status === "playing") {
        void startAt(indexRef.current);
      }
    },
    [player, startAt, status, usesCloudProvider],
  );

  useEffect(() => {
    if (
      usesCloudProvider &&
      playerStatus.didJustFinish &&
      status === "playing"
    ) {
      void speakChunk(indexRef.current + 1, generationRef.current);
    }
  }, [playerStatus.didJustFinish, speakChunk, status, usesCloudProvider]);

  useEffect(() => {
    generationRef.current += 1;
    void Speech.stop();
    player.pause();
    removeCurrentAudioFile();
    indexRef.current = 0;
    setChunkIndex(0);
    setStatus("idle");
  }, [
    player,
    removeCurrentAudioFile,
    settings.ttsProvider,
    settings.ttsVoiceIdentifier,
    text,
  ]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      void Speech.stop();
      player.pause();
      removeCurrentAudioFile();
    },
    [player, removeCurrentAudioFile],
  );

  return {
    canSpeak: chunks.length > 0,
    status,
    chunkIndex,
    chunkCount: chunks.length,
    rate,
    error,
    play,
    pause,
    stop,
    next,
    previous,
    setRate,
  };
}
