import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// Register service worker update handler
if ('serviceWorker' in navigator) {
  // Listen for new service worker installations
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // New service worker has taken control, reload the page
    window.location.reload();
  });

  // Periodically check for service worker updates (every 60 seconds)
  setInterval(() => {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        registration.update();
      }
    });
  }, 60 * 1000);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
