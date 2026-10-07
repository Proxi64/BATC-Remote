import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The production build is written straight into the .NET host's wwwroot,
// so that `dotnet run` serves the latest version of the app.
export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0") },
  build: {
    outDir: "../host/BatcRemote.Host/wwwroot",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false
  },
  server: { port: 5173 },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
} as any);
