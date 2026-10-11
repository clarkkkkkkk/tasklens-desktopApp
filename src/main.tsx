import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './styles/app.css';
import './components/motion/motion.css';
import App from './App';
import { AppProvider } from './app/AppProvider';
import { createServices } from './app/services';
const services = createServices();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider services={services}>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
