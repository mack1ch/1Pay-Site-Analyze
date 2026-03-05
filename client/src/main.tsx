import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { theme } from 'antd';
import App from './App';
import AuthGuard from './AuthGuard';
import './index.css';

const darkTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#6366f1',
    borderRadius: 8,
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={ruRU} theme={darkTheme}>
      <BrowserRouter>
        <AuthGuard>
          <App />
        </AuthGuard>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
