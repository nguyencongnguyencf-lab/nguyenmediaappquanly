import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

// Force purge stale PWA Service Worker caches on new app version release
const CURRENT_APP_VERSION = 'v2.1.0-debt-ledger-redesign-20260806';
if (typeof window !== 'undefined') {
  const savedVersion = localStorage.getItem('kho_app_version');
  if (savedVersion !== CURRENT_APP_VERSION) {
    console.warn(`[PWA CacheBust] Upgrading app cache from ${savedVersion || 'old'} to ${CURRENT_APP_VERSION}`);
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
    localStorage.setItem('kho_app_version', CURRENT_APP_VERSION);
  }
}

// Register Service Worker for PWA Offline capability
export const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('swUpdated'));
  },
  onOfflineReady() {
    console.log('KhoOffline PWA is ready for offline use.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
