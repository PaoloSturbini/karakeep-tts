import { File, Paths } from "expo-file-system";

import type { Settings } from "./settings";

export type TTSProvider = NonNullable<Settings["ttsProvider"]>;

export interface TTSVoiceOption {
  id: string;
  name: string;
  language?: string;
}

export const TTS_PROVIDER_LABELS: Record<TTSProvider, string> = {
  system: "Device voices",
  openai: "OpenAI",
  elevenlabs: "ElevenLabs",
  microsoft: "Microsoft Azure",
  google: "Google Cloud",
};

export const CLOUD_VOICES: Record<
  Exclude<TTSProvider, "system">,
  TTSVoiceOption[]
> = {
  openai: [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
  elevenlabs: [
    { id: "JBFqnCBsd6RMkjVDRZzb", name: "George" },
    { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
    { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  ],
  microsoft: [
    { id: "it-IT-IsabellaNeural", name: "Isabella", language: "it-IT" },
    { id: "it-IT-DiegoNeural", name: "Diego", language: "it-IT" },
    { id: "it-IT-ElsaNeural", name: "Elsa", language: "it-IT" },
    { id: "it-IT-GiuseppeNeural", name: "Giuseppe", language: "it-IT" },
  ],
  google: [
    { id: "it-IT-Neural2-A", name: "Neural2 A", language: "it-IT" },
    { id: "it-IT-Neural2-C", name: "Neural2 C", language: "it-IT" },
    { id: "it-IT-Wavenet-A", name: "WaveNet A", language: "it-IT" },
    { id: "it-IT-Wavenet-D", name: "WaveNet D", language: "it-IT" },
  ],
};

function required(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeBase64(value: string) {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function responseError(response: Response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      detail?: { message?: string } | string;
      message?: string;
    };
    const nested = parsed.error ?? parsed.detail;
    if (typeof nested === "string") return nested;
    return nested?.message ?? parsed.message ?? `HTTP ${response.status}`;
  } catch {
    return body.trim() || `HTTP ${response.status}`;
  }
}

async function requestAudio(
  text: string,
  settings: Settings,
): Promise<Uint8Array> {
  const provider = settings.ttsProvider ?? "system";
  const voice = required(settings.ttsVoiceIdentifier, "Voice");
  let response: Response;

  switch (provider) {
    case "openai":
      response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${required(settings.ttsOpenAIAPIKey, "OpenAI API key")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          input: text,
          voice,
          response_format: "mp3",
        }),
      });
      break;
    case "elevenlabs":
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": required(
              settings.ttsElevenLabsAPIKey,
              "ElevenLabs API key",
            ),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
          }),
        },
      );
      break;
    case "microsoft": {
      const region = required(settings.ttsMicrosoftRegion, "Azure region");
      const language = voice.split("-").slice(0, 2).join("-") || "it-IT";
      response = await fetch(
        `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`,
        {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": required(
              settings.ttsMicrosoftAPIKey,
              "Microsoft Speech key",
            ),
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
          },
          body: `<speak version="1.0" xml:lang="${xmlEscape(language)}"><voice name="${xmlEscape(voice)}">${xmlEscape(text)}</voice></speak>`,
        },
      );
      break;
    }
    case "google":
      response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(required(settings.ttsGoogleAPIKey, "Google Cloud API key"))}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: voice.split("-").slice(0, 2).join("-"),
              name: voice,
            },
            audioConfig: { audioEncoding: "MP3" },
          }),
        },
      );
      if (!response.ok) throw new Error(await responseError(response));
      return decodeBase64(
        required(
          ((await response.json()) as { audioContent?: string }).audioContent,
          "Google audio response",
        ),
      );
    case "system":
      throw new Error("The device provider does not generate cloud audio.");
  }

  if (!response.ok) throw new Error(await responseError(response));
  return new Uint8Array(await response.arrayBuffer());
}

export async function synthesizeCloudSpeech(text: string, settings: Settings) {
  const audio = await requestAudio(text, settings);
  const file = new File(
    Paths.cache,
    `karakeep-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`,
  );
  file.create();
  file.write(audio);
  return file;
}

export function providerIsConfigured(settings: Settings) {
  switch (settings.ttsProvider ?? "system") {
    case "system":
      return true;
    case "openai":
      return !!settings.ttsOpenAIAPIKey?.trim();
    case "elevenlabs":
      return !!settings.ttsElevenLabsAPIKey?.trim();
    case "microsoft":
      return (
        !!settings.ttsMicrosoftAPIKey?.trim() &&
        !!settings.ttsMicrosoftRegion?.trim()
      );
    case "google":
      return !!settings.ttsGoogleAPIKey?.trim();
  }
}
