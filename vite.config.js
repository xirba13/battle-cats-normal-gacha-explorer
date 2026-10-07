import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Security headers (CSP etc.) live in vercel.json for production; `vite preview`
// serves the same ones so the built site can be checked locally under them.
const vercel = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
const securityHeaders = Object.fromEntries(vercel.headers[0].headers.map(({ key, value }) => [key, value]));

// Fully static site: no backend, no API proxy. Dev and preview servers listen
// on localhost only. 5174 so it can run next to the rare-gacha explorer (5173).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 5175, headers: securityHeaders },
  worker: { format: "es" },
});
