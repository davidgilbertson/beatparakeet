import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Tones from './Tones.jsx';
import Techno from './Techno.jsx';
import './index.css';

const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';

let view = <App />;
if (pathname.startsWith('/tones')) {
  view = <Tones />;
} else if (pathname.startsWith('/techno')) {
  view = <Techno />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {view}
  </React.StrictMode>
);
