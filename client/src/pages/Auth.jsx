import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

export default function Auth() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { login } = useAuth();

  const { mutate: submit, isPending, error } = useMutation({
    mutationFn: async () => {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login' ? { email, password } : { email, password, name };
      const res = await axios.post(url, body);
      return res.data;
    },
    onSuccess: (data) => {
      login(data.token, data.user);
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Something went wrong');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submit();
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/nav-icon.png" alt="ShribeTRAKR" className="mx-auto mb-4" style={{ width: '72px', height: '72px', borderRadius: '18px' }} />
          <h1 className="text-3xl font-bold">ShribeTRAKR</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Form */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isPending}
              disabled={!email || !password}
            >
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="text-center text-sm pt-2" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
            {mode === 'login' ? (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Don't have an account? </span>
                <button onClick={() => setMode('register')} className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                  Sign up
                </button>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--color-text-muted)' }}>Already have an account? </span>
                <button onClick={() => setMode('login')} className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
