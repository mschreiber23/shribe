import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Auth from './pages/Auth';

// Lazy-load all pages — keeps initial bundle tiny
const Today    = lazy(() => import('./pages/Today'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Plans    = lazy(() => import('./pages/Plans'));
const Profile  = lazy(() => import('./pages/Profile'));
const People   = lazy(() => import('./pages/People'));
const Privacy  = lazy(() => import('./pages/Privacy'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

function AppRoutes() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Auth />;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 p-4 pb-24 md:pb-6 max-w-5xl mx-auto w-full">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"        element={<Today />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/plans"   element={<Plans />} />
            <Route path="/people"  element={<People />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="*"        element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#2a2a3e',
              color: '#e2e2f0',
              border: '1px solid #3a3a52',
              borderRadius: '0.75rem',
            },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
