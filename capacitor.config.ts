import type { CapacitorConfig } from "@capacitor/cli";

// appId is permanent once an app is uploaded to App Store Connect or Google Play.
// CHANGE-ME: each game sets its own reverse-domain ID and display name before the first upload
// (also in android/app/build.gradle, android strings.xml, the iOS project and codemagic.yaml).
const config: CapacitorConfig = {
  appId: "com.example.chessbase",
  appName: "Chess",
  webDir: "dist",
  backgroundColor: "#0a0607",
  ios: {
    contentInset: "never"
  }
};

export default config;
