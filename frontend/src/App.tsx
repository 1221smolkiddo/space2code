import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { AuthPage } from './features/auth/AuthPage';
import { HomePage } from './features/home/HomePage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

const SessionPage=lazy(()=>import('./features/session/SessionPage').then(module=>({default:module.SessionPage})));

export const App: React.FC = () => {
  const { applyTheme } = useThemeStore();
  const { restore } = useAuthStore();

  useEffect(() => {
    applyTheme();
    void restore();
  }, [applyTheme, restore]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/session/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<div className="app-loading" role="status">Opening collaborative editors…</div>}><SessionPage /></Suspense>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
