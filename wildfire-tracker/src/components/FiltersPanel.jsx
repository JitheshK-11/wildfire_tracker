import { useCallback, useMemo } from 'react';
import { useFireData } from '../context/FireDataContext.jsx';
import { Filter, X, RotateCcw, Search, Globe, RefreshCw } from 'lucide-react';

const REGION_PRESETS = [
  { id: '', label: 'Global (All Regions)', bbox: null },
  { id: 'na', label: 'North America', bbox: { west: -168, south: 15, east: -52, north: 72 } },
  { id: 'sa', label: 'South America', bbox: { west: -82, south: -56, east: -34, north: 13 } },
  { id: 'eu', label: 'Europe', bbox: { west: -25, south: 35, east: 45, north: 71 } },
  { id: 'af', label: 'Africa', bbox: { west: -18, south: -35, east: 52, north: 38 } },
  { id: 'as', label: 'Asia', bbox: { west: 45, south: 5, east: 150, north: 75 } },
  { id: 'oc', label: 'Australia & Oceania', bbox: { west: 110, south: -48, east: 180, north: -10 } },
];

export default function FiltersPanel() {
  const {
    pendingFilters,
    setPendingFilters,
    applyPendingFilters,
    resetFilters,
    removeFilter,
    activeFilterCount,
    filters,
    availableSatellites,
    dateRange,
    requestDays,
    setRequestDays,
    requestSource,
    setRequestSource,
    fetchFires,
    loading,
  } = useFireData();

  const updatePending = useCallback((field, value) => {
    setPendingFilters(prev => ({ ...prev, [field]: value }));
  }, [setPendingFilters]);

  const toggleConfidence = useCallback((level) => {
    setPendingFilters(prev => {
      const current = prev.confidence || [];
      const next = current.includes(level)
        ? current.filter(c => c !== level)
        : [...current, level];
      return { ...prev, confidence: next };
    });
  }, [setPendingFilters]);

  const handleRegionChange = useCallback((e) => {
    const selected = REGION_PRESETS.find(r => r.id === e.target.value);
    setPendingFilters(prev => ({ ...prev, bbox: selected ? selected.bbox : null }));
  }, [setPendingFilters]);

  // Find currently selected region ID for pending filters
  const currentRegionId = useMemo(() => {
    if (!pendingFilters.bbox) return '';
    const match = REGION_PRESETS.find(r =>
      r.bbox &&
      r.bbox.west === pendingFilters.bbox.west &&
      r.bbox.south === pendingFilters.bbox.south &&
      r.bbox.east === pendingFilters.bbox.east &&
      r.bbox.north === pendingFilters.bbox.north
    );
    return match ? match.id : '';
  }, [pendingFilters.bbox]);

  // Find active applied region name for tag display
  const appliedRegionLabel = useMemo(() => {
    if (!filters.bbox) return null;
    const match = REGION_PRESETS.find(r =>
      r.bbox &&
      r.bbox.west === filters.bbox.west &&
      r.bbox.south === filters.bbox.south &&
      r.bbox.east === filters.bbox.east &&
      r.bbox.north === filters.bbox.north
    );
    return match ? match.label : 'Custom Region';
  }, [filters.bbox]);

  // Detect unsaved / pending filter changes
  const hasUnappliedChanges = useMemo(() => {
    return JSON.stringify(pendingFilters) !== JSON.stringify(filters);
  }, [pendingFilters, filters]);

  const confidenceLevels = ['high', 'nominal', 'low'];

  return (
    <div className="filters-panel">
      <div className="filters-header">
        <div className="filters-title-row">
          <Filter size={16} />
          <h3>Filters & Observations</h3>
          {activeFilterCount > 0 && (
            <span className="filter-count-badge">{activeFilterCount} active</span>
          )}
          {hasUnappliedChanges && (
            <span className="pending-badge" title="You have unapplied filter selections">
              Unapplied Changes
            </span>
          )}
        </div>
      </div>

      <div className="filters-grid">
        {/* API-level controls */}
        <div className="filter-group">
          <label htmlFor="filter-source">Satellite Source</label>
          <select
            id="filter-source"
            value={requestSource}
            onChange={e => setRequestSource(e.target.value)}
          >
            <option value="VIIRS_SNPP_NRT">VIIRS SNPP (375m)</option>
            <option value="VIIRS_NOAA20_NRT">VIIRS NOAA-20 (375m)</option>
            <option value="VIIRS_NOAA21_NRT">VIIRS NOAA-21 (375m)</option>
            <option value="MODIS_NRT">MODIS Terra/Aqua (1km)</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-days">Observation Window</label>
          <select
            id="filter-days"
            value={requestDays}
            onChange={e => setRequestDays(e.target.value)}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => (
              <option key={d} value={String(d)}>
                Past {d} day{d > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Region filter */}
        <div className="filter-group">
          <label htmlFor="filter-region">Region Preset</label>
          <select
            id="filter-region"
            value={currentRegionId}
            onChange={handleRegionChange}
          >
            {REGION_PRESETS.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Client-side filters */}
        <div className="filter-group">
          <label htmlFor="filter-start-date">Start Date</label>
          <input
            id="filter-start-date"
            type="date"
            value={pendingFilters.startDate}
            min={dateRange.min}
            max={dateRange.max}
            onChange={e => updatePending('startDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-end-date">End Date</label>
          <input
            id="filter-end-date"
            type="date"
            value={pendingFilters.endDate}
            min={dateRange.min}
            max={dateRange.max}
            onChange={e => updatePending('endDate', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Confidence Level</label>
          <div className="confidence-toggles">
            {confidenceLevels.map(level => (
              <button
                key={level}
                className={`confidence-toggle ${level} ${
                  (pendingFilters.confidence || []).includes(level) ? 'active' : ''
                }`}
                onClick={() => toggleConfidence(level)}
                type="button"
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-daynight">Day / Night</label>
          <select
            id="filter-daynight"
            value={pendingFilters.daynight}
            onChange={e => updatePending('daynight', e.target.value)}
          >
            <option value="">All Times</option>
            <option value="D">Day Only</option>
            <option value="N">Night Only</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-min-frp">Min FRP (MW)</label>
          <input
            id="filter-min-frp"
            type="number"
            min="0"
            step="1"
            value={pendingFilters.minFrp}
            onChange={e => updatePending('minFrp', e.target.value)}
            placeholder="e.g. 10"
          />
        </div>

        {availableSatellites.length > 1 && (
          <div className="filter-group">
            <label htmlFor="filter-satellite">Satellite</label>
            <select
              id="filter-satellite"
              value={pendingFilters.satellite}
              onChange={e => updatePending('satellite', e.target.value)}
            >
              <option value="">All Satellites</option>
              {availableSatellites.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="filter-actions">
        <button
          className={`btn-primary ${hasUnappliedChanges ? 'highlight-apply' : ''}`}
          onClick={applyPendingFilters}
          type="button"
        >
          <Search size={14} />
          Apply Filters
        </button>

        <button
          className="btn-primary btn-fetch"
          onClick={fetchFires}
          disabled={loading}
          type="button"
        >
          <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
          {loading ? 'Fetching NASA Data…' : 'Fetch from NASA'}
        </button>

        {activeFilterCount > 0 && (
          <button className="btn-secondary" onClick={resetFilters} type="button">
            <RotateCcw size={14} />
            Reset All
          </button>
        )}
      </div>

      {/* Active filter tags */}
      {activeFilterCount > 0 && (
        <div className="active-filters">
          <span className="active-filters-label">Active:</span>

          {appliedRegionLabel && (
            <span className="filter-tag">
              <Globe size={11} style={{ marginRight: 2 }} />
              Region: <strong>{appliedRegionLabel}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('bbox')}
                aria-label="Remove region filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.confidence.length > 0 && (
            <span className="filter-tag">
              Confidence: <strong>{filters.confidence.join(', ')}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('confidence')}
                aria-label="Remove confidence filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.daynight && (
            <span className="filter-tag">
              Time: <strong>{filters.daynight === 'D' ? 'Day Only' : 'Night Only'}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('daynight')}
                aria-label="Remove day/night filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.minFrp !== '' && filters.minFrp !== null && (
            <span className="filter-tag">
              FRP ≥ <strong>{filters.minFrp} MW</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('minFrp')}
                aria-label="Remove FRP filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.startDate && (
            <span className="filter-tag">
              From: <strong>{filters.startDate}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('startDate')}
                aria-label="Remove start date filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.endDate && (
            <span className="filter-tag">
              To: <strong>{filters.endDate}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('endDate')}
                aria-label="Remove end date filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {filters.satellite && (
            <span className="filter-tag">
              Satellite: <strong>{filters.satellite}</strong>
              <button
                className="filter-tag-remove"
                onClick={() => removeFilter('satellite')}
                aria-label="Remove satellite filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

