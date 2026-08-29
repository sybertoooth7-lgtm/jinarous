import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Alux Plaza | Cybersecurity Consulting',
        short_name: 'Alux Plaza',
        description: 'Cybersecurity consulting: incident response planning, vulnerability assessments, and compliance readiness (PCI DSS, Kenya DPA 2019) for Nairobi and East Africa.',
        theme_color: '#00d4ff',
        background_color: '#050a12',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // This app is a live dashboard (client compliance status, admin
        // panels, contact form) — none of that should ever be served
        // stale from a cache. Only precache the app shell (JS/CSS/HTML)
        // for fast loads and installability; every /api/* call bypasses
        // the service worker entirely via navigateFallbackDenylist so
        // login, status checks, and form submissions always hit the
        // real network and get real, current data.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Match by path, not hostname — API_BASE is cross-origin in
            // production (Render) but same-origin via the dev proxy, and
            // this should bypass the service worker either way rather
            // than being pinned to one specific backend host.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
