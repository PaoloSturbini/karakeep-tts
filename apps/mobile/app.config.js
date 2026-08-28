const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    ...(IS_DEV
      ? {
          name: "Karakeep (Dev)",
          scheme: "karakeep-dev",
        }
      : {
          name: "kerakeep TTS",
          scheme: "karakeep-tts",
        }),
    slug: "karakeep-tts",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    assetBundlePatterns: ["**/*"],
    experiments: {
      reactCompiler: true,
    },
    ios: {
      supportsTablet: true,
      icon: {
        light: "./assets/icon.png",
        tinted: "./assets/icon-tinted.png",
      },
      bundleIdentifier: IS_DEV
        ? "it.pst.KarakeepTTS.dev"
        : "it.pst.KarakeepTTS",
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: "./assets/splash-white.png",
          resizeMode: "contain",
          backgroundColor: "#000000",
        },
      },
      config: {
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
      buildNumber: "3",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000",
        monochromeImage: "./assets/adaptive-icon.png",
      },
      splash: {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: "./assets/splash-white.png",
          resizeMode: "contain",
          backgroundColor: "#000000",
        },
      },
      package: IS_DEV ? "it.pst.karakeeptts.dev" : "it.pst.karakeeptts",
      versionCode: 3,
    },
    plugins: [
      "./plugins/trust-local-certs.js",
      "./plugins/camera-not-required.js",
      "expo-router",
      "expo-audio",
      "expo-secure-store",
      [
        "expo-image-picker",
        {
          photosPermission:
            "The app access your photo gallary on your request to hoard them.",
        },
      ],
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: true,
            targetSdkVersion: 36,
            ndkVersion: "27.1.12297006",
          },
        },
      ],
      "expo-sharing",
      "expo-web-browser",
    ],
    extra: {
      router: {
        origin: false,
      },
    },
  },
};
