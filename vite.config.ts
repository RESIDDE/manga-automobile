import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    chunkSizeWarningLimit: 900,
    /**
     * The letterhead and the watermark are inlined into the bundle as data
     * URIs; every other asset keeps Vite's default 4 kB rule.
     *
     * These two are what make a printed document look official, and as ordinary
     * asset URLs they could fail to be there when it mattered — a stale tab
     * after a deploy, a cold cache, or simply not finishing loading before
     * Chrome rasterised the print preview. That is how documents came out with
     * a broken logo and no watermark. A data URI cannot 404 and needs no
     * second request, and html2canvas can read it with no CORS question.
     *
     * The cost is ~145 kB of base64 in the chunk that the document pages share,
     * which is loaded only when somebody opens a document. logo-letterhead.png
     * is a copy of logo-print.png kept separate for exactly this reason: the
     * public booking page uses logo-print.png on screen and should keep getting
     * a cacheable PNG, not a data URI.
     */
    assetsInlineLimit: (filePath: string) => {
      if (/logo-(letterhead|watermark)\.png$/.test(filePath)) return true;
      return undefined; // everything else: Vite's default
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split the heavy, rarely-changing libraries out of the app chunk
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
