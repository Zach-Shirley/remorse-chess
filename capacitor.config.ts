import type { CapacitorConfig } from "@capacitor/cli";

// appId is permanent once an app is uploaded to App Store Connect or Google Play.
// "com.example.remorsechess" is a placeholder: set the real reverse-domain ID before the first
// upload (also in android/app/build.gradle, android strings.xml, the iOS project and codemagic.yaml).
const config: CapacitorConfig = {
  appId: "com.example.remorsechess",
  appName: "Remorse Chess",
  webDir: "dist",
  backgroundColor: "#07060d",
  ios: {
    contentInset: "never"
  }
};

export default config;
