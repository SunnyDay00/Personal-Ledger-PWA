import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import vConsoleUrl from 'vconsole/dist/vconsole.min.js?url';

declare global {
  interface Window {
    VConsole?: new () => unknown;
  }
}

const loadVConsole = () => {
  if (document.querySelector('script[data-vconsole]')) return;
  const script = document.createElement('script');
  script.src = vConsoleUrl;
  script.async = true;
  script.dataset.vconsole = 'true';
  script.onload = () => {
    if (window.VConsole) new window.VConsole();
  };
  document.head.appendChild(script);
};

// Initialize vConsole for mobile debugging if enabled.
if (localStorage.getItem('debugMode') === 'true') {
  loadVConsole();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
