import { Capacitor } from "@capacitor/core";

/**
 * Where the app runs: in a browser (page served by BatcRemote.exe) or inside the
 * Android app (Capacitor). Only this module knows about Capacitor.
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * The "page location" used to find BeyondATC. In the Android app the page is not
 * served by the PC (it comes from inside the APK), so there is no automatic host:
 * the address comes from the settings (asked on first launch).
 */
export function pageLocation(): { hostname: string; search: string; protocol: string } {
  if (isNativeApp()) return { hostname: "", search: "", protocol: "app:" };
  return window.location;
}
