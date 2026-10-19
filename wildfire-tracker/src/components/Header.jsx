import { useFireData } from '../context/FireDataContext.jsx';
import { RefreshCw, Flame, Wifi, WifiOff, Database } from 'lucide-react';

export default function Header() {
  const { loading, error, fetchedAt, fromCache, fetchFires, apiSource } = useFireData();

  return (
    <header className="dashboard-header">
      <div className="header-brand">
        <Flame size={28} className="brand-icon" />
        <div>
          <h1 className="brand-title">Wildfire Intelligence</h1>
          <p className="brand-subtitle">
            Real-time satellite fire detection · NASA FIRMS {apiSource || 'VIIRS'}
          </p>
        </div>
      </div>

      <div className="header-status">
        <span className={`status-indicator ${error ? 'error' : 'connected'}`}>
          {error ? <WifiOff size={12} /> : <Wifi size={12} />}
          {error ? 'Error' : 'Connected'}
        </span>

        {fromCache && (
          <span className="status-indicator cached">
            <Database size={12} />
            Cached
          </span>
        )}

        {fetchedAt && (
          <span className="header-fetch-time">
            Last refresh: {new Date(fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="header-actions">
        <button
          className="refresh-btn"
          onClick={fetchFires}
          disabled={loading}
          aria-label="Refresh fire data"
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}
