import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Auth from './pages/Auth';
import { checkSchema } from './lib/schema';

// Lazy-load all pages — keeps initial bundle tiny
const Today    = lazy(() => import('./pages/Today'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Plans    = lazy(() => import('./pages/Plans'));
const Profile  = lazy(() => import('./pages/Profile'));
const People   = lazy(() => import('./pages/People'));
const Privacy  = lazy(() => import('./pages/Privacy'));
const WhoopCallback = lazy(() => import('./pages/WhoopCallback'));

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

function SetupRequired({ onRetry, checking }) {
  return (
    <div className="max-w-lg mx-auto py-16 px-4">
      <h1 className="text-2xl font-bold mb-3">One setup step left</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        ShribeTRAKR now uses the same free Supabase project as your sports app. The database tables are not there yet.
      </p>
      <ol className="text-sm space-y-2 mb-6 list-decimal pl-5">
        <li>Open the Supabase dashboard for the sports app project.</li>
        <li>Go to SQL Editor, then New query.</li>
        <li>Paste the file <span className="font-mono">supabase/setup.sql</span> from the GitHub repo and press Run.</li>
        <li>Come back here and press Check again.</li>
      </ol>
      <a
        className="text-sm text-indigo-400 underline"
        href="https://github.com/mschreiber23/shribe/blob/cursor/github-pages-supabase-9dca/supabase/setup.sql"
        target="_blank"
        rel="noreferrer"
      >
        Open setup.sql on GitHub
      </a>
      <div className="mt-6">
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg font-semibold text-white"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {checking ? 'Checking...' : 'Check again'}
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { token, loading } = useAuth();
  const { data: schemaReady, isLoading: schemaLoading, refetch, isFetching } = useQuery({
    queryKey: ['schema-ready', token],
    queryFn: checkSchema,
    enabled: !!token,
    retry: false,
  });

  if (loading || (token && schemaLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-surface)' }}>
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Auth />;
  if (schemaReady === false) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
        <SetupRequired onRetry={() => refetch()} checking={isFetching} />
      </div>
    );
  }

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
            <Route path="/whoop/callback" element={<WhoopCallback />} />
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
