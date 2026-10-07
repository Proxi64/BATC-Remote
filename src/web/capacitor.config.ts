import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (Capacitor). The web app is the same build as the one served by
 * BatcRemote.exe: `npm run build` then `npx cap sync android`.
 */
const config: CapacitorConfig = {
  appId: "io.github.proxi64.batcremote",
  appName: "BATC Remote",
  webDir: "../host/BatcRemote.Host/wwwroot",
  server: {
    // The app page is served as http://localhost (not https), so the plain
    // ws:// connection to BeyondATC on the local network is not "mixed content".
    androidScheme: "http",
    // Allow unencrypted traffic (ws:// and http:// to the PC on the Wi-Fi).
    cleartext: true
  },
  android: {
    backgroundColor: "#10141b"
  },
  plugins: {
    SystemBars: {
      // Light status bar icons on the dark app; the page draws under the bars and
      // uses env(safe-area-inset-*) (viewport-fit=cover in index.html).
      style: "DARK",
      initialViewportFitValueHint: "cover"
    }
  }
};

export default config;
