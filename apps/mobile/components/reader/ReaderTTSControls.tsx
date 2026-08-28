import { Pressable, View } from "react-native";
import {
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from "lucide-react-native";

import { Text } from "@/components/ui/Text";
import { useTextToSpeech } from "@/lib/useTextToSpeech";

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function ControlButton({
  label,
  disabled = false,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-10 w-10 items-center justify-center rounded-full bg-secondary${disabled ? " opacity-40" : ""}`}
    >
      {children}
    </Pressable>
  );
}

export function ReaderTTSControls({ text }: { text: string }) {
  const speech = useTextToSpeech(text);
  const isPlaying = speech.status === "playing";
  const isLoading = speech.status === "loading";
  const nextRate =
    RATES[
      (RATES.indexOf(speech.rate as (typeof RATES)[number]) + 1) % RATES.length
    ];

  return (
    <View className="border-b border-border bg-background px-4 py-2">
      <View className="flex-row items-center gap-2">
        <ControlButton
          label="Previous section"
          disabled={!speech.canSpeak || speech.chunkIndex === 0}
          onPress={speech.previous}
        >
          <SkipBack size={18} className="text-foreground" />
        </ControlButton>
        <ControlButton
          label={
            isLoading
              ? "Generating speech"
              : isPlaying
                ? "Pause reading"
                : "Read article aloud"
          }
          disabled={!speech.canSpeak || isLoading}
          onPress={isPlaying ? speech.pause : speech.play}
        >
          {isPlaying ? (
            <Pause size={19} className="text-foreground" />
          ) : (
            <Play size={19} className="text-foreground" />
          )}
        </ControlButton>
        <ControlButton
          label="Stop reading"
          disabled={speech.status === "idle"}
          onPress={() => void speech.stop()}
        >
          <RotateCcw size={18} className="text-foreground" />
        </ControlButton>
        <ControlButton
          label="Next section"
          disabled={
            !speech.canSpeak || speech.chunkIndex >= speech.chunkCount - 1
          }
          onPress={speech.next}
        >
          <SkipForward size={18} className="text-foreground" />
        </ControlButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Reading speed ${speech.rate} times`}
          onPress={() => speech.setRate(nextRate)}
          className="ml-auto min-w-12 items-center rounded-full bg-secondary px-3 py-2"
        >
          <Text className="text-sm font-semibold">{speech.rate}×</Text>
        </Pressable>
        {speech.canSpeak && (
          <Text className="text-xs text-muted-foreground">
            {speech.chunkIndex + 1}/{speech.chunkCount}
          </Text>
        )}
      </View>
      {!!speech.error && (
        <Text className="mt-2 text-xs text-destructive">{speech.error}</Text>
      )}
    </View>
  );
}
