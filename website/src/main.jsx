import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

// Font loading detection
if ('fonts' in document) {
  document.fonts.ready.then(() => {
    document.body.classList.add('fonts-loaded');
  });
} else {
  // Fallback for older browsers
  document.body.classList.add('fonts-loaded');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
