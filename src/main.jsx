import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Tones from './Tones.jsx';
import './index.css';

const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {pathname.startsWith('/tones') ? <Tones /> : <App />}
  </React.StrictMode>
);
