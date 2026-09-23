import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      setToken(session?.access_token ?? null);
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (session?.access_token) localStorage.setItem('gymtrack_token', session.access_token);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (session?.access_token) localStorage.setItem('gymtrack_token', session.access_token);
      else localStorage.removeItem('gymtrack_token');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = (newToken, newUser) => {
    if (newToken) localStorage.setItem('gymtrack_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    supabase.auth.signOut();
    localStorage.removeItem('gymtrack_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
