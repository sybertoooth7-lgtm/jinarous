import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// autoUpdate (set in vite.config.ts) means a new deploy replaces the
// service worker in the background automatically — this callback just
// reloads the page once that swap is ready, so a client who has the site
// open when you ship a fix doesn't get stuck on a stale cached version
// until they manually close and reopen the app.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
