import { useFireData } from '../context/FireDataContext.jsx';
import { Activity, AlertTriangle, Eye, Zap, Clock } from 'lucide-react';

export default function KPIBar() {
  const { allFires, filteredFires, mapFires, stats, activeFilterCount } = useFireData();

  const kpis = [
    {
      icon: Activity,
      label: 'Total Detections',
      value: allFires.length.toLocaleString(),
      highlight: false,
    },
    {
      icon: AlertTriangle,
      label: 'High Confidence',
      value: stats.highConfidence.toLocaleString(),
      highlight: stats.highConfidence > 0,
    },
    {
      icon: Eye,
      label: activeFilterCount > 0 ? 'Filtered Results' : 'Visible on Map',
      value: activeFilterCount > 0
        ? filteredFires.length.toLocaleString()
        : mapFires.length.toLocaleString(),
      sub: activeFilterCount > 0
        ? `of ${allFires.length.toLocaleString()} total`
        : filteredFires.length > mapFires.length
          ? `${filteredFires.length.toLocaleString()} total, sampled for performance`
          : null,
      highlight: false,
    },
    {
      icon: Zap,
      label: 'Sum FRP',
      value: stats.totalFrp >= 1000
        ? `${(stats.totalFrp / 1000).toFixed(1)}k`
        : stats.totalFrp.toLocaleString(),
      unit: 'MW',
      sub: 'Sum of reported detection values',
      highlight: true,
    },
    {
      icon: Clock,
      label: 'Latest Acquisition',
      value: stats.latestAcquisition,
      highlight: false,
    },
  ];

  return (
    <div className="kpi-bar" role="region" aria-label="Key performance indicators">
      {kpis.map((kpi, i) => (
        <div className={`kpi-card${kpi.highlight ? ' highlight' : ''}`} key={i}>
          <div className="kpi-icon-row">
            <kpi.icon size={16} className="kpi-icon" />
            <span className="kpi-label">{kpi.label}</span>
          </div>
          <div className="kpi-value">
            {kpi.value}
            {kpi.unit && <span className="kpi-unit"> {kpi.unit}</span>}
          </div>
          {kpi.sub && <p className="kpi-sub">{kpi.sub}</p>}
        </div>
      ))}
    </div>
  );
}
