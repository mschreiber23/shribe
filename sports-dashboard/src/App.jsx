import { FavoritesProvider } from './context/FavoritesContext';
import Header from './components/Header';
import MyTeams from './components/MyTeams';
import PlayerRoster from './components/PlayerRoster';
import './index.css';

export default function App() {
  return (
    <FavoritesProvider>
      <div className="app">
        <Header />
        <main className="main">
          <MyTeams />
          <PlayerRoster />
        </main>
        <footer className="footer">
          <p>Data provided by ESPN · Updates every 30 seconds</p>
        </footer>
      </div>
    </FavoritesProvider>
  );
}
