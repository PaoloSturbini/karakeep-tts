import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { Check, Pause, Play } from "lucide-react-native";

import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import {
  CLOUD_VOICES,
  providerIsConfigured,
  TTS_PROVIDER_LABELS,
} from "@/lib/cloudTextToSpeech";
import type { TTSProvider, TTSVoiceOption } from "@/lib/cloudTextToSpeech";
import useAppSettings from "@/lib/settings";
import { useTextToSpeech } from "@/lib/useTextToSpeech";

const SAMPLE_TEXT =
  "Questa è un'anteprima della voce scelta per la lettura degli articoli.";
const PROVIDERS: TTSProvider[] = [
  "system",
  "openai",
  "elevenlabs",
  "microsoft",
  "google",
];

const DEFAULT_VOICE: Record<Exclude<TTSProvider, "system">, string> = {
  openai: "marin",
  elevenlabs: "JBFqnCBsd6RMkjVDRZzb",
  microsoft: "it-IT-IsabellaNeural",
  google: "it-IT-Neural2-A",
};

function voiceLabel(voice: Speech.Voice) {
  return voice.name || voice.identifier;
}

function CredentialField({
  label,
  value,
  onChangeText,
  secret = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-sm text-muted-foreground">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor="rgb(142, 142, 147)"
        className="rounded-lg bg-secondary px-3 py-3 text-foreground"
      />
    </View>
  );
}

export default function TextToSpeechSettingsPage() {
  const { settings, setSettings } = useAppSettings();
  const previewSpeech = useTextToSpeech(SAMPLE_TEXT);
  const provider = settings.ttsProvider ?? "system";
  const [deviceVoices, setDeviceVoices] = useState<Speech.Voice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [openAIKey, setOpenAIKey] = useState(settings.ttsOpenAIAPIKey ?? "");
  const [elevenLabsKey, setElevenLabsKey] = useState(
    settings.ttsElevenLabsAPIKey ?? "",
  );
  const [microsoftKey, setMicrosoftKey] = useState(
    settings.ttsMicrosoftAPIKey ?? "",
  );
  const [microsoftRegion, setMicrosoftRegion] = useState(
    settings.ttsMicrosoftRegion ?? "westeurope",
  );
  const [googleKey, setGoogleKey] = useState(settings.ttsGoogleAPIKey ?? "");
  const [customVoice, setCustomVoice] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void Speech.getAvailableVoicesAsync()
      .then((available) => {
        if (active) setDeviceVoices(available);
      })
      .finally(() => {
        if (active) setIsLoadingVoices(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const orderedDeviceVoices = useMemo(
    () =>
      [...deviceVoices].sort((left, right) => {
        const leftItalian = left.language.toLowerCase().startsWith("it")
          ? 0
          : 1;
        const rightItalian = right.language.toLowerCase().startsWith("it")
          ? 0
          : 1;
        return (
          leftItalian - rightItalian ||
          left.language.localeCompare(right.language) ||
          voiceLabel(left).localeCompare(voiceLabel(right))
        );
      }),
    [deviceVoices],
  );

  const selectProvider = async (nextProvider: TTSProvider) => {
    await previewSpeech.stop();
    await setSettings({
      ...settings,
      ttsProvider: nextProvider,
      ttsVoiceIdentifier:
        nextProvider === "system" ? undefined : DEFAULT_VOICE[nextProvider],
    });
    setCustomVoice("");
    setSaved(false);
  };

  const saveCredentials = async () => {
    await setSettings({
      ...settings,
      ttsOpenAIAPIKey: openAIKey.trim() || undefined,
      ttsElevenLabsAPIKey: elevenLabsKey.trim() || undefined,
      ttsMicrosoftAPIKey: microsoftKey.trim() || undefined,
      ttsMicrosoftRegion: microsoftRegion.trim() || undefined,
      ttsGoogleAPIKey: googleKey.trim() || undefined,
    });
    setSaved(true);
  };

  const selectVoice = async (identifier?: string) => {
    await previewSpeech.stop();
    await setSettings({ ...settings, ttsVoiceIdentifier: identifier });
  };

  const cloudVoices: TTSVoiceOption[] =
    provider === "system" ? [] : CLOUD_VOICES[provider];
  const configured = providerIsConfigured(settings);
  const previewBusy = ["playing", "loading"].includes(previewSpeech.status);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="px-4 py-3"
    >
      <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Provider
      </Text>
      <View className="mb-5 rounded-xl bg-card px-4 py-2">
        {PROVIDERS.map((item, index) => (
          <View key={item}>
            {index > 0 && (
              <Divider orientation="horizontal" className="h-0.5" />
            )}
            <Pressable
              onPress={() => void selectProvider(item)}
              className="flex-row items-center justify-between py-3"
            >
              <View className="mr-3 flex-1">
                <Text>{TTS_PROVIDER_LABELS[item]}</Text>
                {item === "system" && (
                  <Text className="text-xs text-muted-foreground">
                    Local, no API key and no article text sent online
                  </Text>
                )}
              </View>
              {provider === item && <Check color="rgb(0, 122, 255)" />}
            </Pressable>
          </View>
        ))}
      </View>

      {provider !== "system" && (
        <>
          <Text className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            BYOK configuration
          </Text>
          <View className="mb-5 rounded-xl bg-card px-4 py-3">
            {provider === "openai" && (
              <CredentialField
                label="OpenAI API key"
                value={openAIKey}
                onChangeText={(value) => {
                  setOpenAIKey(value);
                  setSaved(false);
                }}
                placeholder="sk-…"
              />
            )}
            {provider === "elevenlabs" && (
              <CredentialField
                label="ElevenLabs API key"
                value={elevenLabsKey}
                onChangeText={(value) => {
                  setElevenLabsKey(value);
                  setSaved(false);
                }}
              />
            )}
            {provider === "microsoft" && (
              <>
                <CredentialField
                  label="Microsoft Speech key"
                  value={microsoftKey}
                  onChangeText={(value) => {
                    setMicrosoftKey(value);
                    setSaved(false);
                  }}
                />
                <CredentialField
                  label="Azure region"
                  value={microsoftRegion}
                  onChangeText={(value) => {
                    setMicrosoftRegion(value);
                    setSaved(false);
                  }}
                  secret={false}
                  placeholder="westeurope"
                />
              </>
            )}
            {provider === "google" && (
              <CredentialField
                label="Google Cloud API key"
                value={googleKey}
                onChangeText={(value) => {
                  setGoogleKey(value);
                  setSaved(false);
                }}
              />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => void saveCredentials()}
              className="items-center rounded-lg bg-primary px-4 py-3"
            >
              <Text className="font-semibold text-primary-foreground">
                {saved ? "Saved" : "Save API configuration"}
              </Text>
            </Pressable>
            <Text className="mt-2 text-xs text-muted-foreground">
              Keys are saved only in this device&apos;s encrypted secure
              storage.
            </Text>
          </View>
        </>
      )}

      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          Voice
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preview selected voice"
          disabled={!configured || previewSpeech.status === "loading"}
          onPress={
            previewBusy ? previewSpeech.pause : () => previewSpeech.play()
          }
          className={`flex-row items-center gap-2 rounded-full bg-secondary px-3 py-2${!configured ? " opacity-40" : ""}`}
        >
          {previewBusy ? (
            <Pause size={15} className="text-foreground" />
          ) : (
            <Play size={15} className="text-foreground" />
          )}
          <Text className="text-sm font-medium">
            {previewSpeech.status === "loading" ? "Generating…" : "Preview"}
          </Text>
        </Pressable>
      </View>

      <View className="rounded-xl bg-card px-4 py-2">
        {provider === "system" && isLoadingVoices ? (
          <ActivityIndicator className="py-4" />
        ) : (
          <>
            {provider === "system" && (
              <Pressable
                onPress={() => void selectVoice(undefined)}
                className="flex-row items-center justify-between py-2"
              >
                <View>
                  <Text>Automatic</Text>
                  <Text className="text-xs text-muted-foreground">
                    Best matching device voice
                  </Text>
                </View>
                {!settings.ttsVoiceIdentifier && (
                  <Check color="rgb(0, 122, 255)" />
                )}
              </Pressable>
            )}
            {(provider === "system"
              ? orderedDeviceVoices.map((voice) => ({
                  id: voice.identifier,
                  name: voiceLabel(voice),
                  language: `${voice.language} · ${voice.quality}`,
                }))
              : cloudVoices
            ).map((voice, index) => (
              <View key={voice.id}>
                {(provider !== "system" || index > 0) && (
                  <Divider orientation="horizontal" className="h-0.5" />
                )}
                <Pressable
                  onPress={() => void selectVoice(voice.id)}
                  className="flex-row items-center justify-between py-2"
                >
                  <View className="mr-3 flex-1">
                    <Text numberOfLines={1}>{voice.name}</Text>
                    {!!voice.language && (
                      <Text className="text-xs text-muted-foreground">
                        {voice.language}
                      </Text>
                    )}
                  </View>
                  {settings.ttsVoiceIdentifier === voice.id && (
                    <Check color="rgb(0, 122, 255)" />
                  )}
                </Pressable>
              </View>
            ))}
          </>
        )}
      </View>

      {provider !== "system" && (
        <View className="mt-4 rounded-xl bg-card px-4 py-3">
          <Text className="mb-1 text-sm text-muted-foreground">
            Custom voice ID or name
          </Text>
          <View className="flex-row gap-2">
            <TextInput
              value={customVoice}
              onChangeText={setCustomVoice}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Provider voice identifier"
              placeholderTextColor="rgb(142, 142, 147)"
              className="flex-1 rounded-lg bg-secondary px-3 py-3 text-foreground"
            />
            <Pressable
              disabled={!customVoice.trim()}
              onPress={() => void selectVoice(customVoice.trim())}
              className={`justify-center rounded-lg bg-secondary px-4${!customVoice.trim() ? " opacity-40" : ""}`}
            >
              <Text className="font-medium">Use</Text>
            </Pressable>
          </View>
        </View>
      )}

      {!!previewSpeech.error && (
        <Text className="mt-3 text-sm text-destructive">
          {previewSpeech.error}
        </Text>
      )}
    </ScrollView>
  );
}
