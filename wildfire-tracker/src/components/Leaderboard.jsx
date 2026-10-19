import { useFireData } from '../context/FireDataContext.jsx';
import { confidenceColor, confidenceLabel, formatAcqTime } from '../utils/fireUtils.js';
import { Trophy, MapPin, Zap } from 'lucide-react';

export default function Leaderboard() {
  const { topFires, selectedFire, setSelectedFire, loading, filteredFires } = useFireData();

  return (
    <div className="leaderboard side-panel">
      <div className="leaderboard-header">
        <div className="leaderboard-title-row">
          <Trophy size={16} />
          <h2>Top 10 Detections</h2>
        </div>
        <p className="leaderboard-subtitle">Ranked by Fire Radiative Power (FRP)</p>
      </div>

      <div className="leaderboard-list">
        {topFires.map((fire, index) => {
          const isSelected = selectedFire &&
            selectedFire.latitude === fire.latitude &&
            selectedFire.longitude === fire.longitude &&
            selectedFire.acq_time === fire.acq_time;

          return (
            <button
              className={`leaderboard-item${isSelected ? ' selected' : ''}`}
              key={`${fire.latitude}-${fire.longitude}-${fire.acq_time}-${index}`}
              onClick={() => setSelectedFire(fire)}
              aria-label={`Detection ranked #${index + 1}, FRP ${fire.frp} MW`}
            >
              <span className="leaderboard-rank">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="leaderboard-details">
                <div className="leaderboard-frp">
                  <Zap size={14} />
                  {fire.frp !== null ? `${fire.frp.toFixed(1)} MW` : 'N/A'}
                </div>

                <div className="leaderboard-meta">
                  <span>
                    <MapPin size={10} />
                    {fire.latitude.toFixed(3)}°, {fire.longitude.toFixed(3)}°
                  </span>
                  <span>
                    {fire.acq_date || 'N/A'} {formatAcqTime(fire.acq_time)} UTC
                  </span>
                  <span>
                    {fire.satellite || 'N/A'} · {fire.instrument || ''}
                  </span>
                </div>
              </div>

              <span
                className={`leaderboard-confidence ${(fire._confidenceCategory || 'unknown')}`}
                style={{ borderColor: confidenceColor(fire.confidence) }}
              >
                {confidenceLabel(fire.confidence)}
              </span>
            </button>
          );
        })}

        {!loading && topFires.length === 0 && (
          <div className="empty-state">
            <p>No detections match current filters.</p>
          </div>
        )}

        {topFires.length > 0 && (
          <p className="leaderboard-footer">
            Showing top {topFires.length} of {filteredFires.length.toLocaleString()} filtered detections
          </p>
        )}
      </div>
    </div>
  );
}
