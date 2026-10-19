/**
 * Fire data utility functions.
 * Shared across all dashboard components for consistent behavior.
 */

/** Safely coerce a value to a finite number, or return null. */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalize a FIRMS confidence value to a canonical category.
 * FIRMS uses categorical confidence: "low" / "l", "nominal" / "n", "high" / "h".
 * MODIS may use numeric percentages — we bucket those into categories.
 */
export function normalizeConfidence(raw) {
  if (!raw && raw !== 0) return 'unknown';
  const value = String(raw).trim().toLowerCase();

  if (value === 'h' || value === 'high') return 'high';
  if (value === 'n' || value === 'nominal') return 'nominal';
  if (value === 'l' || value === 'low') return 'low';

  // MODIS numeric confidence (0-100)
  const num = Number(value);
  if (Number.isFinite(num)) {
    if (num >= 80) return 'high';
    if (num >= 30) return 'nominal';
    return 'low';
  }

  return 'unknown';
}

/** Map a confidence category to its display color. */
export function confidenceColor(confidence) {
  const cat = normalizeConfidence(confidence);
  switch (cat) {
    case 'high': return '#ef4444';
    case 'nominal': return '#f97316';
    case 'low': return '#eab308';
    default: return '#64748b';
  }
}

/** Get a human-readable label for a confidence category. */
export function confidenceLabel(confidence) {
  const cat = normalizeConfidence(confidence);
  switch (cat) {
    case 'high': return 'High';
    case 'nominal': return 'Nominal';
    case 'low': return 'Low';
    default: return 'Unknown';
  }
}

/**
 * Calculate circle/point radius from FRP (Fire Radiative Power in MW).
 * Uses a square-root scale clamped between min and max pixel sizes.
 */
export function frpToRadius(frp, { minRadius = 3, maxRadius = 20, scaleFactor = 0.8 } = {}) {
  const value = toNumber(frp);
  if (value === null || value <= 0) return minRadius;
  return Math.min(maxRadius, Math.max(minRadius, minRadius + Math.sqrt(value) * scaleFactor));
}

/**
 * Validate and clean a raw fire record from the parsed CSV.
 * Returns null if the record has invalid coordinates.
 */
export function validateFireRecord(raw) {
  const lat = toNumber(raw.latitude);
  const lon = toNumber(raw.longitude);

  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    ...raw,
    latitude: lat,
    longitude: lon,
    bright_ti4: toNumber(raw.bright_ti4),
    bright_ti5: toNumber(raw.bright_ti5),
    frp: toNumber(raw.frp),
    scan: toNumber(raw.scan),
    track: toNumber(raw.track),
    confidence: raw.confidence,
    _confidenceCategory: normalizeConfidence(raw.confidence),
  };
}

/**
 * Apply client-side filters to a list of validated fire records.
 * Returns the filtered array.
 */
export function applyFilters(fires, filters) {
  let result = fires;

  // Confidence filter
  if (filters.confidence && filters.confidence.length > 0) {
    const allowed = new Set(filters.confidence.map(c => c.toLowerCase()));
    result = result.filter(f => allowed.has(f._confidenceCategory));
  }

  // Day/Night filter
  if (filters.daynight) {
    const dn = filters.daynight.toUpperCase();
    result = result.filter(f => {
      const val = String(f.daynight || '').toUpperCase();
      return val === dn;
    });
  }

  // Minimum FRP
  if (filters.minFrp !== null && filters.minFrp !== undefined && filters.minFrp !== '') {
    const min = Number(filters.minFrp);
    if (Number.isFinite(min)) {
      result = result.filter(f => f.frp !== null && f.frp >= min);
    }
  }

  // Satellite / source
  if (filters.satellite) {
    result = result.filter(f =>
      String(f.satellite || '').toLowerCase().includes(filters.satellite.toLowerCase())
    );
  }

  // Date range (acq_date is YYYY-MM-DD)
  if (filters.startDate) {
    result = result.filter(f => (f.acq_date || '') >= filters.startDate);
  }
  if (filters.endDate) {
    result = result.filter(f => (f.acq_date || '') <= filters.endDate);
  }

  // Bounding box
  if (filters.bbox) {
    const { west, south, east, north } = filters.bbox;
    result = result.filter(f =>
      f.latitude >= south && f.latitude <= north &&
      f.longitude >= west && f.longitude <= east
    );
  }

  return result;
}

/**
 * Compute KPI statistics from an array of fire records.
 * All values come from actual data — nothing invented.
 */
export function computeStats(fires) {
  const total = fires.length;
  let highConfidence = 0;
  let totalFrp = 0;
  let latestAcqDate = '';
  let latestAcqTime = '';
  let dayCount = 0;
  let nightCount = 0;

  const confidenceCounts = { high: 0, nominal: 0, low: 0, unknown: 0 };
  const frpValues = [];
  const dateCounts = {};
  const satelliteCounts = {};

  for (const fire of fires) {
    // Confidence
    const cat = fire._confidenceCategory || normalizeConfidence(fire.confidence);
    confidenceCounts[cat] = (confidenceCounts[cat] || 0) + 1;
    if (cat === 'high') highConfidence++;

    // FRP
    if (fire.frp !== null && fire.frp !== undefined) {
      const frpVal = typeof fire.frp === 'number' ? fire.frp : toNumber(fire.frp);
      if (frpVal !== null) {
        totalFrp += frpVal;
        frpValues.push(frpVal);
      }
    }

    // Day/Night
    const dn = String(fire.daynight || '').toUpperCase();
    if (dn === 'D') dayCount++;
    else if (dn === 'N') nightCount++;

    // Latest acquisition
    const acqDate = fire.acq_date || '';
    const acqTime = String(fire.acq_time || '').padStart(4, '0');
    if (acqDate > latestAcqDate || (acqDate === latestAcqDate && acqTime > latestAcqTime)) {
      latestAcqDate = acqDate;
      latestAcqTime = acqTime;
    }

    // Date counts
    if (acqDate) {
      dateCounts[acqDate] = (dateCounts[acqDate] || 0) + 1;
    }

    // Satellite counts
    const sat = fire.satellite || 'Unknown';
    satelliteCounts[sat] = (satelliteCounts[sat] || 0) + 1;
  }

  return {
    total,
    highConfidence,
    totalFrp: Math.round(totalFrp * 100) / 100,
    latestAcquisition: latestAcqDate
      ? `${latestAcqDate} ${latestAcqTime.slice(0, 2)}:${latestAcqTime.slice(2)} UTC`
      : 'N/A',
    dayCount,
    nightCount,
    confidenceCounts,
    frpValues,
    dateCounts,
    satelliteCounts,
  };
}

/**
 * Sample an array down to maxCount items using strided sampling.
 * Preserves the first and last items for context.
 */
export function sampleArray(arr, maxCount) {
  if (arr.length <= maxCount) return arr;
  const step = Math.ceil(arr.length / maxCount);
  const sampled = [];
  for (let i = 0; i < arr.length; i += step) {
    sampled.push(arr[i]);
  }
  return sampled;
}

/**
 * Format a UTC acquisition time string (HHMM) to HH:MM.
 */
export function formatAcqTime(acqTime) {
  const t = String(acqTime || '').padStart(4, '0');
  return `${t.slice(0, 2)}:${t.slice(2)}`;
}
