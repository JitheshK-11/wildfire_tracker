import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyFilters, computeStats, validateFireRecord, sampleArray } from '../utils/fireUtils.js';

const FireDataContext = createContext(null);

const API_BASE = 'http://localhost:3001';

const DEFAULT_FILTERS = {
  confidence: [],
  daynight: '',
  minFrp: '',
  satellite: '',
  startDate: '',
  endDate: '',
  bbox: null,
};

export function FireDataProvider({ children }) {
  // Raw data from API
  const [allFires, setAllFires] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [apiSource, setApiSource] = useState('');

  // API request parameters
  const [requestDays, setRequestDays] = useState('1');
  const [requestSource, setRequestSource] = useState('VIIRS_SNPP_NRT');

  // Client-side filters
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState(DEFAULT_FILTERS);

  // Selected fire for cross-view highlighting
  const [selectedFire, setSelectedFire] = useState(null);

  // Active view tab
  const [activeView, setActiveView] = useState('dashboard');

  // Track previous successful data so we can preserve it on error
  const lastGoodData = useRef([]);

  // Dismiss error
  const dismissError = useCallback(() => setError(''), []);

  /** Fetch fires from the backend API */
  const fetchFires = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        days: requestDays,
        source: requestSource,
      });

      const response = await fetch(`${API_BASE}/api/fires?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Unable to load fire data.');
      }

      // Validate and clean all records
      const validated = (data.fires || [])
        .map(validateFireRecord)
        .filter(Boolean);

      setAllFires(validated);
      lastGoodData.current = validated;
      setFetchedAt(data.fetchedAt || new Date().toISOString());
      setFromCache(data.fromCache || false);
      setApiSource(data.source || requestSource);
      setSelectedFire(null);
    } catch (err) {
      setError(err.message);
      // Preserve last good data
      setAllFires(prev => {
        if (prev.length === 0 && lastGoodData.current.length > 0) {
          return lastGoodData.current;
        }
        return prev;
      });
    } finally {
      setLoading(false);
    }
  }, [requestDays, requestSource]);

  // Initial fetch
  useEffect(() => {
    fetchFires();
  }, [fetchFires]);

  // Apply client-side filters to produce the filtered dataset
  const filteredFires = useMemo(
    () => applyFilters(allFires, filters),
    [allFires, filters]
  );

  // Compute stats from filtered fires
  const stats = useMemo(
    () => computeStats(filteredFires),
    [filteredFires]
  );

  // Stats for the full unfiltered dataset
  const totalStats = useMemo(
    () => computeStats(allFires),
    [allFires]
  );

  // Top 10 fires by FRP (descending)
  const topFires = useMemo(() => {
    return [...filteredFires]
      .filter(f => f.frp !== null)
      .sort((a, b) => (b.frp || 0) - (a.frp || 0))
      .slice(0, 10);
  }, [filteredFires]);

  // Map fires: sampled for performance (max 5000 markers)
  const mapFires = useMemo(
    () => sampleArray(filteredFires, 5000),
    [filteredFires]
  );

  // Globe fires: sampled for performance (max 10000 points)
  const globeFires = useMemo(
    () => sampleArray(filteredFires, 10000),
    [filteredFires]
  );

  // Scatter plot fires: sampled (max 15000 points)
  const scatterFires = useMemo(
    () => sampleArray(filteredFires, 15000),
    [filteredFires]
  );

  // Apply pending filters
  const applyPendingFilters = useCallback(() => {
    setFilters({ ...pendingFilters });
  }, [pendingFilters]);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPendingFilters(DEFAULT_FILTERS);
  }, []);

  // Remove a single active filter
  const removeFilter = useCallback((field) => {
    setFilters(prev => {
      const next = { ...prev };
      if (field === 'confidence') next.confidence = [];
      else if (field === 'bbox') next.bbox = null;
      else next[field] = '';
      setPendingFilters(next);
      return next;
    });
  }, []);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.confidence.length > 0) count++;
    if (filters.daynight) count++;
    if (filters.minFrp !== '' && filters.minFrp !== null) count++;
    if (filters.satellite) count++;
    if (filters.startDate) count++;
    if (filters.endDate) count++;
    if (filters.bbox) count++;
    return count;
  }, [filters]);

  // Get unique satellites from current data
  const availableSatellites = useMemo(() => {
    const sats = new Set();
    for (const f of allFires) {
      if (f.satellite) sats.add(f.satellite);
    }
    return [...sats].sort();
  }, [allFires]);

  // Get date range from current data
  const dateRange = useMemo(() => {
    if (allFires.length === 0) return { min: '', max: '' };
    let min = allFires[0].acq_date || '';
    let max = min;
    for (const f of allFires) {
      const d = f.acq_date || '';
      if (d && d < min) min = d;
      if (d && d > max) max = d;
    }
    return { min, max };
  }, [allFires]);

  const value = {
    // Data
    allFires,
    filteredFires,
    mapFires,
    globeFires,
    scatterFires,
    topFires,

    // Stats
    stats,
    totalStats,

    // State
    loading,
    error,
    dismissError,
    fetchedAt,
    fromCache,
    apiSource,

    // Request params (for the NASA API call)
    requestDays,
    setRequestDays,
    requestSource,
    setRequestSource,

    // Filters
    filters,
    pendingFilters,
    setPendingFilters,
    applyPendingFilters,
    resetFilters,
    removeFilter,
    activeFilterCount,
    availableSatellites,
    dateRange,

    // Selection
    selectedFire,
    setSelectedFire,

    // View
    activeView,
    setActiveView,

    // Actions
    fetchFires,
  };

  return (
    <FireDataContext.Provider value={value}>
      {children}
    </FireDataContext.Provider>
  );
}

export function useFireData() {
  const context = useContext(FireDataContext);
  if (!context) {
    throw new Error('useFireData must be used within a FireDataProvider');
  }
  return context;
}

export default FireDataContext;
