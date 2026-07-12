import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silence benign Vite HMR and WebSocket errors/rejections from registering as unhandled rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (reason.message && (reason.message.includes('WebSocket') || reason.message.includes('websocket') || reason.message.includes('vite'))) ||
      String(reason).includes('WebSocket') ||
      String(reason).includes('websocket')
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  window.addEventListener('error', (event) => {
    if (event.message && (
      event.message.includes('WebSocket') ||
      event.message.includes('websocket') ||
      event.message.includes('vite')
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

