import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Today from './pages/Today';
import Schedule from './pages/Schedule';
import Plans from './pages/Plans';
import History from './pages/History';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1 p-4 pb-24 md:pb-6 max-w-5xl mx-auto w-full">
            <Routes>
              <Route path="/" element={<Today />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/plans" element={<Plans />} />
              <Route path="/history" element={<History />} />
            </Routes>
          </main>
        </div>
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
      </BrowserRouter>
    </QueryClientProvider>
  );
}
