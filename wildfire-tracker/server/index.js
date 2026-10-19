import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { parse } from "csv-parse/sync";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());

// Server configuration
const PORT = process.env.PORT || 3001;
const FIRMS_KEY = process.env.FIRMS_MAP_KEY;

// Cache TTL: configurable via CACHE_TTL_MS, default 15 minutes (900,000 ms)
const envTtl = Number(process.env.CACHE_TTL_MS);
const CACHE_TTL_MS = Number.isFinite(envTtl) && envTtl > 0 ? envTtl : 900000;

// Rate limit: at most 1 NASA request every 60 seconds
const RATE_LIMIT_MS = 60 * 1000;
const NASA_TIMEOUT_MS = 15000; // 15-second request timeout

// Server start time for health metrics
const SERVER_START_TIME = new Date().toISOString();

// Supported NASA satellite sources
const VALID_SOURCES = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT",
];

/**
 * In-memory cache storage.
 * Map<string, { source: string, days: number, fetchedAt: string, fetchedAtMs: number, fires: Array<object> }>
 * Keyed by NASA request params: `${source}_${days}`
 */
const cache = new Map();

/**
 * Tracks in-flight NASA fetch promises for deduplication.
 * Map<string, Promise<{ fires: Array<object>, fetchedAt: string }>>
 */
const inFlightRequests = new Map();

/**
 * Timestamp of the last attempted NASA API fetch (ms since epoch).
 * Used to enforce the rate-limit guard (max 1 request per 60 seconds).
 */
let lastFetchAttempt = 0;

/**
 * Safely coerce a value to a finite number or null.
 *
 * @param {*} value
 * @returns {number|null}
 */
function toNullableNumber(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === "") return null;
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

/**
 * Validates coordinate string value.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidCoordinate(value) {
  if (value === null || value === undefined) return false;
  const str = String(value).trim();
  if (str === "") return false;
  const num = Number(str);
  return Number.isFinite(num);
}

/**
 * Maps confidence values into standard categories: 'low', 'nominal', or 'high'.
 * Supports VIIRS ('l', 'n', 'h', 'low', 'nominal', 'high')
 * and MODIS percentage-based confidence (0-100).
 *
 * @param {*} conf
 * @returns {"low"|"nominal"|"high"|null}
 */
function getConfidenceCategory(conf) {
  if (conf === null || conf === undefined) return null;
  const s = String(conf).trim().toLowerCase();
  if (s === "h" || s === "high") return "high";
  if (s === "n" || s === "nominal") return "nominal";
  if (s === "l" || s === "low") return "low";

  // Numeric confidence handling (e.g. MODIS 0-100)
  const num = Number(s);
  if (Number.isFinite(num)) {
    if (num >= 80) return "high";
    if (num >= 50) return "nominal";
    return "low";
  }

  return null;
}

/**
 * Fetches raw CSV data from NASA FIRMS API, parses it, and validates numeric fields.
 *
 * @param {string} source
 * @param {number} days
 * @returns {Promise<Array<object>>}
 */
async function fetchActiveWildfiresFromNASA(source, days) {
  if (!FIRMS_KEY) {
    throw new Error("FIRMS_MAP_KEY is missing from .env file");
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${FIRMS_KEY}/${source}/world/${days}`;

  // AbortController with 15-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`NASA FIRMS request timed out after ${NASA_TIMEOUT_MS / 1000} seconds`));
  }, NASA_TIMEOUT_MS);

  let response;
  let csv;

  try {
    response = await fetch(url, { signal: controller.signal });
    csv = await response.text();
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") {
      throw new Error(`NASA FIRMS request timed out after ${NASA_TIMEOUT_MS / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    console.error("NASA status:", response.status);
    console.error("NASA response:", csv);
    throw new Error(`NASA FIRMS returned HTTP ${response.status}: ${csv}`);
  }

  if (csv.trimStart().startsWith("<")) {
    console.error("NASA HTML/XML error response:", csv);
    throw new Error(`Unexpected HTML/XML response from NASA: ${csv.substring(0, 100)}`);
  }

  // Parse CSV
  const rawRecords = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  });

  // Numeric validation and field coercion
  const validatedRecords = [];
  for (const raw of rawRecords) {
    if (!isValidCoordinate(raw.latitude) || !isValidCoordinate(raw.longitude)) {
      // Skip row if latitude or longitude are not valid finite numbers
      continue;
    }

    const lat = Number(raw.latitude);
    const lon = Number(raw.longitude);

    // Validate coordinate boundaries
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      continue;
    }

    const fire = {
      ...raw,
      latitude: lat,
      longitude: lon,
      bright_ti4: toNullableNumber(raw.bright_ti4 ?? raw.brightness),
      bright_ti5: toNullableNumber(raw.bright_ti5 ?? raw.bright_t31),
      frp: toNullableNumber(raw.frp),
      scan: toNullableNumber(raw.scan),
      track: toNullableNumber(raw.track),
    };

    // Retain MODIS-specific brightness aliases if present
    if (raw.brightness !== undefined) {
      fire.brightness = toNullableNumber(raw.brightness);
    }
    if (raw.bright_t31 !== undefined) {
      fire.bright_t31 = toNullableNumber(raw.bright_t31);
    }

    validatedRecords.push(fire);
  }

  return validatedRecords;
}

/**
 * Retrieves wildfire data with caching, in-flight deduplication, and rate-limiting.
 *
 * @param {string} source
 * @param {number} days
 * @returns {Promise<{ fires: Array<object>, fetchedAt: string, fromCache: boolean }>}
 */
async function getWildfiresData(source, days) {
  const cacheKey = `${source}_${days}`;
  const now = Date.now();

  // 1. Check in-memory cache within TTL
  const cachedEntry = cache.get(cacheKey);
  if (cachedEntry && now - cachedEntry.fetchedAtMs < CACHE_TTL_MS) {
    return {
      fires: cachedEntry.fires,
      fetchedAt: cachedEntry.fetchedAt,
      fromCache: true,
    };
  }

  // 2. Request deduplication: if an identical fetch is in-flight, return the pending promise
  if (inFlightRequests.has(cacheKey)) {
    const result = await inFlightRequests.get(cacheKey);
    return {
      fires: result.fires,
      fetchedAt: result.fetchedAt,
      fromCache: true,
    };
  }

  // 3. Rate-limit guard: at most 1 NASA request per 60 seconds
  const timeSinceLastFetch = now - lastFetchAttempt;
  if (lastFetchAttempt > 0 && timeSinceLastFetch < RATE_LIMIT_MS) {
    // If we have an existing cache entry (even if past TTL), return it as a graceful fallback
    if (cachedEntry) {
      return {
        fires: cachedEntry.fires,
        fetchedAt: cachedEntry.fetchedAt,
        fromCache: true,
      };
    }

    const waitSeconds = Math.ceil((RATE_LIMIT_MS - timeSinceLastFetch) / 1000);
    const rateLimitError = new Error(
      `NASA FIRMS rate limit active. At most 1 request allowed per 60 seconds. Please retry in ${waitSeconds}s.`
    );
    rateLimitError.statusCode = 429;
    throw rateLimitError;
  }

  // Update lastFetchAttempt immediately to prevent race conditions
  lastFetchAttempt = Date.now();

  // 4. Initiate NASA request and register in inFlightRequests map
  const fetchPromise = (async () => {
    try {
      const fires = await fetchActiveWildfiresFromNASA(source, days);
      const fetchedAt = new Date().toISOString();
      const entry = {
        source,
        days,
        fetchedAt,
        fetchedAtMs: Date.now(),
        fires,
      };

      cache.set(cacheKey, entry);
      return { fires, fetchedAt, fromCache: false };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return await fetchPromise;
}

/**
 * GET /
 * Enhanced health check endpoint returning server uptime and cache metrics.
 */
app.get("/", (req, res) => {
  res.json({
    status: "healthy",
    cacheEntries: cache.size,
    cacheTtlMs: CACHE_TTL_MS,
    upSince: SERVER_START_TIME,
  });
});

/**
 * GET /api/fires
 * Fetches active wildfires from NASA FIRMS API with caching, rate-limiting, and server-side filtering.
 */
app.get("/api/fires", async (req, res) => {
  const requestedAt = new Date().toISOString();

  try {
    // 1. Validate 'source' query parameter (default: VIIRS_SNPP_NRT)
    let source = "VIIRS_SNPP_NRT";
    if (req.query.source !== undefined) {
      const trimmedSource = String(req.query.source).trim().toUpperCase();
      const matched = VALID_SOURCES.find((s) => s.toUpperCase() === trimmedSource);
      if (!matched) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: `Invalid source '${req.query.source}'. Allowed sources: ${VALID_SOURCES.join(", ")}`,
        });
      }
      source = matched;
    }

    // 2. Validate 'days' query parameter (1-10, default: 1)
    let days = 1;
    if (req.query.days !== undefined) {
      const parsedDays = Number(req.query.days);
      if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 10) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Parameter 'days' must be an integer between 1 and 10",
        });
      }
      days = parsedDays;
    }

    // 3. Fetch data (handling cache, in-flight deduplication, rate limiting)
    const { fires: allFires, fetchedAt, fromCache } = await getWildfiresData(source, days);

    // 4. Apply server-side filters
    const appliedFilters = {};
    let filteredFires = allFires;

    // Filter: confidence (comma-separated list: low, nominal, high or l, n, h)
    if (req.query.confidence !== undefined) {
      const rawConf = String(req.query.confidence).trim();
      const tokens = rawConf
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (tokens.length === 0) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Parameter 'confidence' cannot be empty",
        });
      }

      const validTokens = new Set(["l", "low", "n", "nominal", "h", "high"]);
      const invalidTokens = tokens.filter((t) => !validTokens.has(t));
      if (invalidTokens.length > 0) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: `Invalid confidence value(s): ${invalidTokens.join(", ")}. Allowed values are: low (l), nominal (n), high (h)`,
        });
      }

      const allowedCategories = new Set();
      for (const token of tokens) {
        if (token === "l" || token === "low") allowedCategories.add("low");
        if (token === "n" || token === "nominal") allowedCategories.add("nominal");
        if (token === "h" || token === "high") allowedCategories.add("high");
      }

      filteredFires = filteredFires.filter((fire) => {
        const cat = getConfidenceCategory(fire.confidence);
        return cat !== null && allowedCategories.has(cat);
      });

      appliedFilters.confidence = Array.from(allowedCategories);
    }

    // Filter: daynight ("D" or "N")
    if (req.query.daynight !== undefined) {
      const dn = String(req.query.daynight).trim().toUpperCase();
      if (dn !== "D" && dn !== "N") {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Parameter 'daynight' must be 'D' or 'N'",
        });
      }

      filteredFires = filteredFires.filter(
        (fire) => String(fire.daynight ?? "").trim().toUpperCase() === dn
      );
      appliedFilters.daynight = dn;
    }

    // Filter: minFrp (numeric)
    if (req.query.minFrp !== undefined) {
      const minFrp = Number(req.query.minFrp);
      if (!Number.isFinite(minFrp)) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Parameter 'minFrp' must be a finite number",
        });
      }

      filteredFires = filteredFires.filter(
        (fire) => fire.frp !== null && fire.frp >= minFrp
      );
      appliedFilters.minFrp = minFrp;
    }

    // Filter: bbox ("west,south,east,north")
    if (req.query.bbox !== undefined) {
      const bboxParts = String(req.query.bbox)
        .split(",")
        .map((v) => Number(v.trim()));

      if (bboxParts.length !== 4 || bboxParts.some((v) => !Number.isFinite(v))) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Parameter 'bbox' must be 4 comma-separated numbers: west,south,east,north",
        });
      }

      const [west, south, east, north] = bboxParts;

      if (south < -90 || south > 90 || north < -90 || north > 90) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Latitude values in bbox (south, north) must be between -90 and 90",
        });
      }
      if (west < -180 || west > 180 || east < -180 || east > 180) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "Longitude values in bbox (west, east) must be between -180 and 180",
        });
      }
      if (south > north) {
        return res.status(400).json({
          error: "Invalid query parameter",
          details: "In bbox, south latitude cannot be greater than north latitude",
        });
      }

      filteredFires = filteredFires.filter((fire) => {
        if (fire.latitude < south || fire.latitude > north) return false;
        if (west <= east) {
          return fire.longitude >= west && fire.longitude <= east;
        } else {
          // Bounding box crosses the antimeridian (-180 / 180 longitude)
          return fire.longitude >= west || fire.longitude <= east;
        }
      });

      appliedFilters.bbox = { west, south, east, north };
    }

    // Filter: date (optional date filter matching acq_date YYYY-MM-DD from frontend)
    if (req.query.date) {
      const targetDate = String(req.query.date).trim();
      filteredFires = filteredFires.filter((fire) => fire.acq_date === targetDate);
      appliedFilters.date = targetDate;
    }

    // 5. Send enhanced response
    res.json({
      source,
      fetchedAt,
      requestedAt,
      fromCache,
      totalRecords: allFires.length,
      count: filteredFires.length,
      filters: appliedFilters,
      fires: filteredFires,
    });
  } catch (error) {
    console.error("Wildfire API error:", error.message);
    const statusCode = error.statusCode || 502;
    res.status(statusCode).json({
      error: statusCode === 429 ? "Rate limit exceeded" : "Failed to fetch wildfire data",
      details: error.message,
    });
  }
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Wildfire backend running at http://localhost:${PORT}`);
});
