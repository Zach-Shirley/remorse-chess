import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// True inside the iOS/Android app shell, false in any browser.
export const isNativeApp = Capacitor.isNativePlatform();

// Native builds have no Vercel env vars, so they need the production server baked in.
export const PRODUCTION_GAME_SERVER_URL = "https://checkers-with-a-knight-server.onrender.com";

// Every screen is dark, so the status bar always uses light text.
export function applyStatusBarStyle() {
  if (!isNativeApp) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
}
