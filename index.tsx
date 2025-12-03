import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import VConsole from 'vconsole';

// Initialize vConsole for mobile debugging if enabled
if (localStorage.getItem('debugMode') === 'true') {
  new VConsole();
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
