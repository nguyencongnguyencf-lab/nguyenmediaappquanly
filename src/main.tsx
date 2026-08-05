import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA Offline capability
const updateSW = registerSW({
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
