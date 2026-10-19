import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useFireData } from '../context/FireDataContext.jsx';
import {
  confidenceColor,
  confidenceLabel,
  frpToRadius,
  formatAcqTime,
} from '../utils/fireUtils.js';
import { Map as MapIcon, Info } from 'lucide-react';

/**
 * Inner map component that renders fire markers and handles fly-to selection.
 * Uses CircleMarker (SVG/canvas) instead of Circle for much better performance
 * with thousands of markers.
 */
function FireMarkers({ fires, selectedFire }) {
  const map = useMap();

  useEffect(() => {
    if (selectedFire) {
      map.flyTo(
        [selectedFire.latitude, selectedFire.longitude],
        7,
        { duration: 1 }
      );
    }
  }, [map, selectedFire]);

  return (
    <>
      {fires.map((fire, index) => {
        const color = confidenceColor(fire.confidence);
        const radius = frpToRadius(fire.frp, { minRadius: 3, maxRadius: 16, scaleFactor: 0.6 });

        return (
          <CircleMarker
            key={`${fire.acq_date}-${fire.acq_time}-${fire.latitude}-${fire.longitude}-${index}`}
            center={[fire.latitude, fire.longitude]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.7,
              weight: 1,
            }}
          >
            <Popup>
              <div className="fire-popup">
                <div className="fire-popup-title">
                  🔥 Satellite Fire Detection
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Location</span>
                  <span className="fire-popup-value">
                    {fire.latitude.toFixed(4)}°, {fire.longitude.toFixed(4)}°
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Brightness (Ti4)</span>
                  <span className="fire-popup-value">
                    {fire.bright_ti4 !== null ? `${fire.bright_ti4.toFixed(1)} K` : 'N/A'}
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">FRP</span>
                  <span className="fire-popup-value">
                    {fire.frp !== null ? `${fire.frp.toFixed(1)} MW` : 'N/A'}
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Confidence</span>
                  <span className="fire-popup-value" style={{ color: confidenceColor(fire.confidence) }}>
                    {confidenceLabel(fire.confidence)}
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Satellite</span>
                  <span className="fire-popup-value">
                    {fire.satellite || 'N/A'} · {fire.instrument || ''}
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Acquisition</span>
                  <span className="fire-popup-value">
                    {fire.acq_date || 'N/A'} {formatAcqTime(fire.acq_time)} UTC
                  </span>
                </div>
                <div className="fire-popup-row">
                  <span className="fire-popup-label">Day/Night</span>
                  <span className="fire-popup-value">
                    {fire.daynight === 'D' ? '☀️ Day' : fire.daynight === 'N' ? '🌙 Night' : 'N/A'}
                  </span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default function FireMap() {
  const { mapFires, filteredFires, selectedFire, loading } = useFireData();

  return (
    <div className="map-container main-panel">
      <div className="map-header">
        <div className="map-title-row">
          <MapIcon size={16} />
          <h2>Global Hotspot Map</h2>
        </div>
        <div className="map-subtitle">
          <span>Circle size: FRP · Color: confidence level</span>
          <span className="live-tag">● SATELLITE DATA</span>
        </div>
      </div>

      <div className="map-wrapper">
        {loading && mapFires.length === 0 && (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>Loading fire data…</p>
          </div>
        )}
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          worldCopyJump
          preferCanvas={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FireMarkers
            fires={mapFires}
            selectedFire={selectedFire}
          />
        </MapContainer>
      </div>

      <div className="map-legend">
        <span className="map-legend-item">
          <i style={{ background: '#ef4444' }} /> High confidence
        </span>
        <span className="map-legend-item">
          <i style={{ background: '#f97316' }} /> Nominal confidence
        </span>
        <span className="map-legend-item">
          <i style={{ background: '#eab308' }} /> Low confidence
        </span>
        <span className="map-legend-item">
          <i style={{ background: '#64748b' }} /> Unknown
        </span>
      </div>

      <div className="map-info-bar">
        <Info size={12} />
        <span>
          Showing {mapFires.length.toLocaleString()} markers
          {mapFires.length < filteredFires.length && (
            <> (sampled from {filteredFires.length.toLocaleString()} filtered detections for performance)</>
          )}
        </span>
      </div>
    </div>
  );
}
