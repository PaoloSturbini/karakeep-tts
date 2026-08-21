import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";

const TARGET_CHUNK_LENGTH = 1_200;

export type SpeechStatus = "idle" | "playing" | "paused";

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
  const chunks = useMemo(() => chunkArticleText(text), [text]);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [chunkIndex, setChunkIndex] = useState(0);
  const [rate, setRateState] = useState(1);
  const generationRef = useRef(0);
  const indexRef = useRef(0);
  const rateRef = useRef(1);

  const speakChunk = useCallback(
    (index: number, generation: number) => {
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
      setStatus("playing");
      Speech.speak(chunk, {
        rate: rateRef.current,
        onDone: () => speakChunk(index + 1, generation),
        onError: () => {
          if (generation === generationRef.current) setStatus("idle");
        },
      });
    },
    [chunks],
  );

  const startAt = useCallback(
    async (index: number) => {
      generationRef.current += 1;
      const generation = generationRef.current;
      await Speech.stop();
      speakChunk(Math.max(0, Math.min(index, chunks.length - 1)), generation);
    },
    [chunks.length, speakChunk],
  );

  const play = useCallback(() => {
    if (!chunks.length) return;
    if (status === "paused" && Platform.OS === "ios") {
      void Speech.resume().then(() => setStatus("playing"));
      return;
    }
    void startAt(status === "idle" ? 0 : indexRef.current);
  }, [chunks.length, startAt, status]);

  const pause = useCallback(() => {
    if (status !== "playing") return;
    if (Platform.OS === "ios") {
      void Speech.pause().then(() => setStatus("paused"));
    } else {
      // Android has no native pause. Stop and repeat the current short chunk
      // when playback resumes so no following text is skipped.
      generationRef.current += 1;
      void Speech.stop().then(() => setStatus("paused"));
    }
  }, [status]);

  const stop = useCallback(async () => {
    generationRef.current += 1;
    await Speech.stop();
    indexRef.current = 0;
    setChunkIndex(0);
    setStatus("idle");
  }, []);

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
      if (status === "playing") void startAt(indexRef.current);
    },
    [startAt, status],
  );

  useEffect(() => {
    generationRef.current += 1;
    void Speech.stop();
    indexRef.current = 0;
    setChunkIndex(0);
    setStatus("idle");
  }, [text]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      void Speech.stop();
    },
    [],
  );

  return {
    canSpeak: chunks.length > 0,
    status,
    chunkIndex,
    chunkCount: chunks.length,
    rate,
    play,
    pause,
    stop,
    next,
    previous,
    setRate,
  };
}
