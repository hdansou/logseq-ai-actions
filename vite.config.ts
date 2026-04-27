import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: true,
  },
  server: {
    // Bind to loopback only — Logseq loads the dev bundle from
    // localhost, and `0.0.0.0` would expose every dev iteration to the
    // LAN. Override with `--host` if you need cross-device testing.
    host: "127.0.0.1",
    port: 8080,
    cors: true,
  },
  // JSX is configured via tsconfig.json (`jsx: react-jsx`,
  // `jsxImportSource: preact`). Vite/esbuild reads those automatically —
  // don't duplicate them here (Vite 8's ESBuildOptions type doesn't expose
  // the JSX fields and would fail typecheck).
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
