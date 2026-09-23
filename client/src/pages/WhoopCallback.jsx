import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { finishWhoopConnect } from '../api';

export default function WhoopCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Connecting Whoop...');

  useEffect(() => {
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error_description') || params.get('error');
    if (error || !code || !state) {
      setMessage(error || 'Whoop did not return a login code.');
      return;
    }
    finishWhoopConnect(code, state)
      .then(() => navigate('/profile?whoop=connected', { replace: true }))
      .catch((err) => setMessage(err.message || 'Whoop connection failed'));
  }, [params, navigate]);

  return (
    <div className="py-20 text-center">
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{message}</p>
    </div>
  );
}
