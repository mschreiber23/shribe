import { NavLink } from 'react-router-dom';
import { CalendarDays, ClipboardList, UserCircle, LogOut, Users, Dumbbell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

const links = [
  { to: '/', label: 'Today', icon: Dumbbell },
  { to: '/schedule', label: 'Plan', icon: CalendarDays },
  { to: '/plans', label: 'Workouts', icon: ClipboardList },
  { to: '/people', label: 'Users', icon: Users },
  { to: '/profile', label: 'Me', icon: UserCircle },
];

export default function Navbar() {
  const { logout } = useAuth();
  const qc = useQueryClient();

  const handleLogout = () => {
    qc.clear();
    logout();
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {/* Mobile */}
      <div className="max-w-5xl mx-auto flex md:hidden">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                isActive ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <Icon size={22} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden md:flex items-center gap-1 px-4 py-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mr-6">
          <img src="/logo.png" alt="ShribeTRAKR" style={{ height: '28px', width: 'auto' }} />
        </div>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
        <div className="ml-auto">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
