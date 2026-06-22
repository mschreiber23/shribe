import { NavLink } from 'react-router-dom';
import { Dumbbell, CalendarDays, ClipboardList, BarChart2 } from 'lucide-react';

const links = [
  { to: '/', label: 'Today', icon: Dumbbell },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/plans', label: 'Plans', icon: ClipboardList },
  { to: '/history', label: 'History', icon: BarChart2 },
];

export default function Navbar() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
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

      {/* Desktop sidebar */}
      <div className="hidden md:flex items-center gap-1 px-4 py-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mr-6">
          <Dumbbell size={22} className="text-indigo-400" />
          <span className="font-bold text-lg">GymTrack</span>
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
      </div>
    </nav>
  );
}
