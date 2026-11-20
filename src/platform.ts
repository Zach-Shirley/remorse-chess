import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

// True inside the iOS/Android app shell, false in any browser.
export const isNativeApp = Capacitor.isNativePlatform();

// Native builds have no Vercel env vars, so they need the production server baked in.
// This is the address Render gives a service named "remorse-chess-server" (render.yaml).
// Correct it if Render assigns another name.
export const PRODUCTION_GAME_SERVER_URL = "https://remorse-chess-server.onrender.com";

// Every screen is dark, so the status bar always uses light text.
export function applyStatusBarStyle() {
  if (!isNativeApp) return;
  void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
}
