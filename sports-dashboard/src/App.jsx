import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { FavoritesProvider } from './context/FavoritesContext';
import MyTeams from './components/MyTeams';
import TodaysScores from './components/TodaysScores';
import StatLeaders from './components/StatLeaders';
import InstallBanner from './components/InstallBanner';
import PlayerRoster from './components/PlayerRoster';
import TeamPage from './pages/TeamPage';
import BoxScorePage from './pages/BoxScorePage';
import PlayerPage from './pages/PlayerPage';
import './index.css';

function Dashboard() {
  return (
    <>
      <InstallBanner />
      <main className="main">
        <TodaysScores />
        <MyTeams />
        <PlayerRoster />
        <StatLeaders />
      </main>
      <footer className="footer">
        <p>Data provided by ESPN · Updates every 30 seconds</p>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <FavoritesProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/player/:sport/:playerId" element={
              <main className="main"><PlayerPage /></main>
            } />
            <Route path="/boxscore/:sport/:gameId" element={
              <main className="main"><BoxScorePage /></main>
            } />
            <Route path="/team/:sport/:teamId" element={
              <main className="main"><TeamPage /></main>
            } />
          </Routes>
        </div>
      </FavoritesProvider>
    </BrowserRouter>
  );
}
