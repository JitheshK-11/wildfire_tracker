import { Suspense, lazy } from 'react';
import { FireDataProvider, useFireData } from './context/FireDataContext.jsx';
import Header from './components/Header.jsx';
import KPIBar from './components/KPIBar.jsx';
import FiltersPanel from './components/FiltersPanel.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import FireMap from './components/FireMap.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AnalyticsCharts from './components/AnalyticsCharts.jsx';
import { Map, Globe2, BarChart3 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Lazy-load expensive 3D components
const GlobeView = lazy(() => import('./components/GlobeView.jsx'));
const ScatterPlot3D = lazy(() => import('./components/ScatterPlot3D.jsx'));

function LoadingFallback({ label }) {
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <p>Loading {label}…</p>
    </div>
  );
}

const VIEW_TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: Map },
  { key: 'globe', label: '3D Globe', icon: Globe2 },
  { key: 'analytics', label: 'Analytics', icon: BarChart3 },
];

function DashboardContent() {
  const { activeView, setActiveView } = useFireData();

  return (
    <div className="dashboard">
      <Header />
      <ErrorBanner />
      <KPIBar />

      {/* View Tabs */}
      <nav className="view-tabs" role="tablist" aria-label="Dashboard views">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            className={`view-tab${activeView === tab.key ? ' active' : ''}`}
            onClick={() => setActiveView(tab.key)}
            role="tab"
            aria-selected={activeView === tab.key}
            aria-controls={`panel-${tab.key}`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </nav>

      <FiltersPanel />

      {/* Dashboard View */}
      {activeView === 'dashboard' && (
        <div id="panel-dashboard" role="tabpanel">
          <div className="workspace-grid">
            <FireMap />
            <Leaderboard />
          </div>
          <AnalyticsCharts />
        </div>
      )}

      {/* Globe View */}
      {activeView === 'globe' && (
        <div id="panel-globe" role="tabpanel">
          <div className="workspace-grid">
            <Suspense fallback={<LoadingFallback label="3D Globe" />}>
              <GlobeView />
            </Suspense>
            <Leaderboard />
          </div>
        </div>
      )}

      {/* Analytics View */}
      {activeView === 'analytics' && (
        <div id="panel-analytics" role="tabpanel">
          <Suspense fallback={<LoadingFallback label="3D Scatter Plot" />}>
            <ScatterPlot3D />
          </Suspense>
          <AnalyticsCharts />
        </div>
      )}

      <footer className="dashboard-footer">
        <p>
          Fire detections are satellite observations, not confirmed fire perimeters.
          This dashboard is for informational purposes, not emergency dispatch.
        </p>
        <p>
          Data source: NASA FIRMS (Fire Information for Resource Management System).
          Observation timestamps are in UTC.
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <FireDataProvider>
      <DashboardContent />
    </FireDataProvider>
  );
}
