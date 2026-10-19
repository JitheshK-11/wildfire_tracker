import { useFireData } from '../context/FireDataContext.jsx';
import { AlertTriangle, X } from 'lucide-react';

export default function ErrorBanner() {
  const { error, dismissError, allFires } = useFireData();

  if (!error) return null;

  return (
    <div className="error-banner" role="alert">
      <AlertTriangle size={16} />
      <div className="error-content">
        <strong>Data fetch error:</strong> {error}
        {allFires.length > 0 && (
          <span className="error-stale-note">
            {' '}— Showing previously loaded data ({allFires.length.toLocaleString()} detections).
          </span>
        )}
      </div>
      <button onClick={dismissError} className="error-dismiss" aria-label="Dismiss error">
        <X size={14} />
      </button>
    </div>
  );
}
