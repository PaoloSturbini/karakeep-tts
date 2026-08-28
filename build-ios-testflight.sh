#!/bin/bash
#
# Archivia Kerakeep TTS per iOS, esporta l'IPA e lo carica su TestFlight.
#
set -euo pipefail

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

CONFIG_FILE="$HOME/.rssbrain-testflight.env"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

PROJECT_DIR="/Users/paolosturbini/Documents/Sviluppo App/Netcup/karakeep-tts"
IOS_DIR="$PROJECT_DIR/apps/mobile/ios"
WORK="/tmp/kerakeep-tts-ios"
ARCHIVE="$WORK/kerakeepTTS.xcarchive"
OPTIONS="$WORK/ExportOptions.plist"
TEAM="F9SXX7XX48"
BUILD_STATE="$HOME/.kerakeep-tts-build-number"

cd "$PROJECT_DIR"
mkdir -p "$WORK"

echo "▶︎ Prebuild iOS…"
pnpm --filter @karakeep/mobile exec expo prebuild --platform ios --no-install

echo "▶︎ Incremento build number…"
PROJECT_BUILD_NUMBER="$(xcodebuild -workspace "$IOS_DIR/kerakeepTTS.xcworkspace" -scheme kerakeepTTS -configuration Release -showBuildSettings 2>/dev/null | awk '/CURRENT_PROJECT_VERSION/ { value=$3 } END { print value }')"
if [ -f "$BUILD_STATE" ]; then
  LAST_BUILD_NUMBER="$(tr -dc '0-9' < "$BUILD_STATE")"
else
  LAST_BUILD_NUMBER="$PROJECT_BUILD_NUMBER"
fi
LAST_BUILD_NUMBER="${LAST_BUILD_NUMBER:-0}"
if [ "$PROJECT_BUILD_NUMBER" -gt "$LAST_BUILD_NUMBER" ]; then
  LAST_BUILD_NUMBER="$PROJECT_BUILD_NUMBER"
fi
BUILD_NUMBER="$((LAST_BUILD_NUMBER + 1))"
BUILD_STATE_TEMP="/tmp/kerakeep-tts-build-number.$$"
printf '%s\n' "$BUILD_NUMBER" > "$BUILD_STATE_TEMP"
/bin/cp "$BUILD_STATE_TEMP" "$BUILD_STATE"
/bin/rm "$BUILD_STATE_TEMP"
EXPORT_DIR="$WORK/export-build-$BUILD_NUMBER"
echo "   Build: $BUILD_NUMBER"

echo "▶︎ Archive iOS (Release)…"
xcodebuild \
  -workspace "$IOS_DIR/kerakeepTTS.xcworkspace" \
  -scheme kerakeepTTS \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$WORK/DerivedData" \
  DEVELOPMENT_TEAM="$TEAM" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates \
  clean archive

APP_INFO_PLIST="$ARCHIVE/Products/Applications/kerakeepTTS.app/Info.plist"
ENCRYPTION_DECLARATION="$(/usr/libexec/PlistBuddy -c 'Print :ITSAppUsesNonExemptEncryption' "$APP_INFO_PLIST" 2>/dev/null || true)"
if [ "$ENCRYPTION_DECLARATION" != "false" ]; then
  echo "✗ Dichiarazione export compliance assente o errata nell'archivio." >&2
  echo "  ITSAppUsesNonExemptEncryption deve essere false." >&2
  exit 1
fi
echo "✓ Export compliance: usa soltanto crittografia esente/fornita dal sistema."

echo "▶︎ Creo ExportOptions.plist…"
/bin/cat > "$OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key><string>app-store-connect</string>
    <key>teamID</key><string>$TEAM</string>
    <key>destination</key><string>export</string>
    <key>uploadSymbols</key><true/>
    <key>signingStyle</key><string>automatic</string>
</dict>
</plist>
PLIST

echo "▶︎ Export IPA…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OPTIONS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates

IPA="$(ls "$EXPORT_DIR"/*.ipa 2>/dev/null | head -1)"
if [ -z "$IPA" ]; then
  echo "✗ Nessun IPA generato in $EXPORT_DIR" >&2
  exit 1
fi
echo "   IPA: $IPA"

echo "▶︎ Upload su TestFlight…"
if [ -n "${ASC_API_KEY_ID:-}" ] && [ -n "${ASC_API_ISSUER:-}" ]; then
  xcrun altool --upload-app -f "$IPA" -t ios \
    --apiKey "$ASC_API_KEY_ID" --apiIssuer "$ASC_API_ISSUER"
  echo "✅ Caricato su TestFlight (API key). Attendi l'elaborazione su App Store Connect."
elif [ -n "${ASC_APPLE_ID:-}" ] && [ -n "${ASC_APP_PASSWORD:-}" ]; then
  xcrun altool --upload-app -f "$IPA" -t ios \
    -u "$ASC_APPLE_ID" -p "$ASC_APP_PASSWORD"
  echo "✅ Caricato su TestFlight (Apple ID). Attendi l'elaborazione su App Store Connect."
else
  echo "⚠️  Nessuna credenziale impostata: IPA pronto ma NON caricato."
  echo "    Caricalo con Transporter, oppure imposta le variabili ASC_* e rilancia."
fi
