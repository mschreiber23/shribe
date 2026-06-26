import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── Shribely Logo Icon ──────────────────────────────── */
function ShribelyIcon({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="19" cy="19" r="19" fill="url(#sg)" />
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {/* Stylised S */}
      <text x="19" y="26" textAnchor="middle" fontSize="22" fontWeight="900" fontFamily="Georgia, serif" fill="white" letterSpacing="-1">S</text>
    </svg>
  );
}

/* ── Icons ───────────────────────────────────────────── */
function ScoresIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
  );
}

function StandingsIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}

function LeadersIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}

function MeIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function DFSIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
      <line x1="7" y1="10" x2="7" y2="13"/>
      <line x1="12" y1="7" x2="12" y2="13"/>
      <line x1="17" y1="9" x2="17" y2="13"/>
    </svg>
  );
}

function RankIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? '#a855f7' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { path: '/scores',    label: 'Scores',    Icon: ScoresIcon },
  { path: '/dfs',       label: 'DFS',       Icon: DFSIcon },
  { path: '/',          label: 'Shribely',  logo: true },
  { path: '/leaders',   label: 'Leaders',   Icon: LeadersIcon },
  { path: '/me',        label: 'Me',        Icon: MeIcon },
];

function NavItem({ item, active }) {
  if (item.logo) {
    return (
      <Link to={item.path} className={`nav-item nav-item-logo ${active ? 'nav-item-active' : ''}`}>
        <div className="nav-logo-wrap">
          <ShribelyIcon size={40} />
        </div>
        <span className="nav-label nav-label-logo">{item.label}</span>
      </Link>
    );
  }
  const { Icon } = item;
  return (
    <Link to={item.path} className={`nav-item ${active ? 'nav-item-active' : ''}`}>
      <Icon active={active} />
      <span className="nav-label">{item.label}</span>
    </Link>
  );
}

/* ── Bottom Nav (mobile) ─────────────────────────────── */
export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => (
        <NavItem key={item.path} item={item} active={pathname === item.path} />
      ))}
    </nav>
  );
}

/* ── Top Nav (desktop) ───────────────────────────────── */
export function TopNav() {
  const { pathname } = useLocation();
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <Link to="/" className="top-nav-brand">
          <ShribelyIcon size={28} />
          <span>Shribely</span>
        </Link>
        <div className="top-nav-links">
          {NAV_ITEMS.filter((i) => !i.logo).map((item) => {
            const { Icon } = item;
            const active = pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className={`top-nav-link ${active ? 'top-nav-link-active' : ''}`}>
                <Icon active={active} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
