import { useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider, useFavorites } from './context/FavoritesContext';
import { BottomNav, TopNav } from './components/Nav';
import InstallBanner from './components/InstallBanner';
import MyTeams from './components/MyTeams';
import PlayerRoster from './components/PlayerRoster';
import TodaysScores from './components/TodaysScores';
import TeamPage from './pages/TeamPage';
import BoxScorePage from './pages/BoxScorePage';
import PlayerPage from './pages/PlayerPage';
import AuthPage from './pages/AuthPage';
import ScoresPage from './pages/ScoresPage';
import StandingsPage from './pages/StandingsPage';
import LeadersPage from './pages/LeadersPage';
import ProfilePage from './pages/ProfilePage';
import './index.css';

/* ── Home Dashboard ─────────────────────────────────── */
function Dashboard() {
  const [editMode, setEditMode] = useState(false);
  const { favorites } = useFavorites();
  const hasContent = favorites.teams.length > 0 || favorites.players.length > 0;

  return (
    <main className="main">
      <TodaysScores />
      <MyTeams editMode={editMode} setEditMode={setEditMode} />
      <PlayerRoster editMode={editMode} setEditMode={setEditMode} />
      {hasContent && (
        <button
          className={`dashboard-edit-btn ${editMode ? 'dashboard-edit-btn-active' : ''}`}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? '✓ Done Editing' : '✎ Edit Dashboard'}
        </button>
      )}
    </main>
  );
}

/* ── App shell with nav ─────────────────────────────── */
function AppShell({ userId }) {
  const { pathname } = useLocation();
  const isSubPage = ['/player/', '/boxscore/', '/team/'].some((p) => pathname.startsWith(p));

  return (
    <FavoritesProvider userId={userId}>
      <div className="app">
        <TopNav />
        <InstallBanner />
        <div className="app-body">
          <Routes>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/scores"    element={<main className="main"><ScoresPage /></main>} />
            <Route path="/standings" element={<main className="main"><StandingsPage /></main>} />
            <Route path="/leaders"   element={<main className="main"><LeadersPage /></main>} />
            <Route path="/me"        element={<main className="main"><ProfilePage /></main>} />
            <Route path="/player/:sport/:playerId" element={<main className="main"><PlayerPage /></main>} />
            <Route path="/boxscore/:sport/:gameId" element={<main className="main"><BoxScorePage /></main>} />
            <Route path="/team/:sport/:teamId"     element={<main className="main"><TeamPage /></main>} />
          </Routes>
        </div>
        <BottomNav />
      </div>
    </FavoritesProvider>
  );
}

function AppInner() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <HashRouter>
      <AppShell userId={user.id} />
    </HashRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
