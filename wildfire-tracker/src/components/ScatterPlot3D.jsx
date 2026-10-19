import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useFireData } from '../context/FireDataContext.jsx';
import { confidenceLabel, formatAcqTime, sampleArray } from '../utils/fireUtils.js';
import { Box, Info, ToggleLeft, ToggleRight } from 'lucide-react';

const CONFIDENCE_CATEGORIES = ['high', 'nominal', 'low', 'unknown'];
const CATEGORY_COLORS = {
  high: '#ef4444',
  nominal: '#f97316',
  low: '#eab308',
  unknown: '#64748b',
};

/**
 * Interactive 3D scatter plot using Plotly.js.
 * X = Longitude, Y = Latitude, Z = FRP (MW).
 * Genuine interactive 3D visualization — not decorative.
 */
export default function ScatterPlot3D() {
  const { scatterFires, allFires, filteredFires, activeFilterCount } = useFireData();
  const [useFiltered, setUseFiltered] = useState(true);
  const MAX_POINTS = 15000;

  const dataSource = useFiltered ? scatterFires : sampleArray(allFires, MAX_POINTS);
  const totalSource = useFiltered ? filteredFires.length : allFires.length;
  const renderedCount = dataSource.length;

  // Group fires by confidence category for separate traces
  const traces = useMemo(() => {
    const groups = {};
    for (const cat of CONFIDENCE_CATEGORIES) {
      groups[cat] = { x: [], y: [], z: [], text: [], ids: [] };
    }

    for (const fire of dataSource) {
      const cat = fire._confidenceCategory || 'unknown';
      const group = groups[cat] || groups.unknown;

      group.x.push(fire.longitude);
      group.y.push(fire.latitude);
      group.z.push(fire.frp !== null ? fire.frp : 0);
      group.text.push(
        `<b>Location:</b> ${fire.latitude.toFixed(4)}°, ${fire.longitude.toFixed(4)}°<br>` +
        `<b>FRP:</b> ${fire.frp !== null ? fire.frp.toFixed(1) + ' MW' : 'N/A'}<br>` +
        `<b>Confidence:</b> ${confidenceLabel(fire.confidence)}<br>` +
        `<b>Satellite:</b> ${fire.satellite || 'N/A'}<br>` +
        `<b>Acquisition:</b> ${fire.acq_date || 'N/A'} ${formatAcqTime(fire.acq_time)} UTC`
      );
    }

    return CONFIDENCE_CATEGORIES
      .filter(cat => groups[cat].x.length > 0)
      .map(cat => ({
        type: 'scatter3d',
        mode: 'markers',
        name: `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${groups[cat].x.length})`,
        x: groups[cat].x,
        y: groups[cat].y,
        z: groups[cat].z,
        text: groups[cat].text,
        hoverinfo: 'text',
        marker: {
          size: 3,
          color: CATEGORY_COLORS[cat],
          opacity: 0.7,
          line: { width: 0 },
        },
      }));
  }, [dataSource]);

  const layout = useMemo(() => ({
    title: {
      text: 'Fire Detections: Geographic Position & Fire Radiative Power',
      font: { color: '#e2e8f0', size: 14, family: 'Inter, sans-serif' },
    },
    paper_bgcolor: '#111827',
    plot_bgcolor: '#111827',
    font: { color: '#94a3b8', family: 'Inter, sans-serif', size: 11 },
    scene: {
      xaxis: {
        title: 'Longitude (°)',
        gridcolor: '#1e2d3d',
        zerolinecolor: '#2a3a4d',
        color: '#94a3b8',
      },
      yaxis: {
        title: 'Latitude (°)',
        gridcolor: '#1e2d3d',
        zerolinecolor: '#2a3a4d',
        color: '#94a3b8',
      },
      zaxis: {
        title: 'FRP (MW)',
        gridcolor: '#1e2d3d',
        zerolinecolor: '#2a3a4d',
        color: '#94a3b8',
      },
      bgcolor: '#0a0e17',
    },
    legend: {
      font: { color: '#94a3b8', size: 11 },
      bgcolor: 'rgba(17, 24, 39, 0.8)',
      bordercolor: '#1e2d3d',
      borderwidth: 1,
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    showlegend: true,
  }), []);

  const config = useMemo(() => ({
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['toImage'],
  }), []);

  return (
    <div className="analytics-container">
      <div className="scatter-header">
        <div className="scatter-title-row">
          <Box size={16} />
          <h2>3D Scatter Plot — Fire Detections</h2>
        </div>
        <div className="scatter-controls">
          <button
            className={`btn-secondary dataset-toggle ${useFiltered ? 'active' : ''}`}
            onClick={() => setUseFiltered(!useFiltered)}
            type="button"
          >
            {useFiltered ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {useFiltered ? 'Filtered Data' : 'All Data'}
          </button>
        </div>
      </div>

      <div className="scatter-plot-wrapper">
        {dataSource.length > 0 ? (
          <Plot
            data={traces}
            layout={layout}
            config={config}
            style={{ width: '100%', height: '500px' }}
            useResizeHandler
          />
        ) : (
          <div className="empty-state">
            <p>No data to plot. Adjust filters or fetch new data.</p>
          </div>
        )}
      </div>

      <div className="scatter-info">
        <div className="map-info-bar">
          <Info size={12} />
          <span>
            Rendering {renderedCount.toLocaleString()} points
            {renderedCount < totalSource && (
              <> (sampled from {totalSource.toLocaleString()} for performance)</>
            )}
            {' · '}
            {useFiltered && activeFilterCount > 0
              ? 'Showing filtered dataset'
              : 'Showing full dataset'}
          </span>
        </div>
        <p className="analytics-description">
          This 3D scatter plot visualizes satellite fire detection positions (longitude, latitude) against
          their Fire Radiative Power (FRP in MW). The Z-axis represents FRP intensity, not terrain
          elevation. Points are colored by confidence category. Rotate, zoom, and hover to inspect
          individual detections.
        </p>
      </div>
    </div>
  );
}
