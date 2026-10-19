import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import { useFireData } from '../context/FireDataContext.jsx';
import { BarChart3, TrendingUp, Sun } from 'lucide-react';

const CONFIDENCE_COLORS = {
  high: '#ef4444',
  nominal: '#f97316',
  low: '#eab308',
  unknown: '#64748b',
};

const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#1a2332',
  border: '1px solid #2a3a4d',
  borderRadius: '8px',
  color: '#e2e8f0',
  fontSize: '12px',
};

function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-title">
        {Icon && <Icon size={14} />}
        <span>{title}</span>
      </div>
      <div className="chart-card-body">
        {children}
      </div>
    </div>
  );
}

export default function AnalyticsCharts() {
  const { stats, filteredFires } = useFireData();

  // Confidence distribution data
  const confidenceData = useMemo(() => {
    return [
      { name: 'High', value: stats.confidenceCounts.high, fill: CONFIDENCE_COLORS.high },
      { name: 'Nominal', value: stats.confidenceCounts.nominal, fill: CONFIDENCE_COLORS.nominal },
      { name: 'Low', value: stats.confidenceCounts.low, fill: CONFIDENCE_COLORS.low },
      { name: 'Unknown', value: stats.confidenceCounts.unknown, fill: CONFIDENCE_COLORS.unknown },
    ].filter(d => d.value > 0);
  }, [stats.confidenceCounts]);

  // FRP distribution (histogram-like buckets)
  const frpDistribution = useMemo(() => {
    const buckets = [
      { name: '0–5', min: 0, max: 5, count: 0 },
      { name: '5–15', min: 5, max: 15, count: 0 },
      { name: '15–50', min: 15, max: 50, count: 0 },
      { name: '50–100', min: 50, max: 100, count: 0 },
      { name: '100–500', min: 100, max: 500, count: 0 },
      { name: '500+', min: 500, max: Infinity, count: 0 },
    ];

    for (const val of stats.frpValues) {
      for (const bucket of buckets) {
        if (val >= bucket.min && val < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }

    return buckets;
  }, [stats.frpValues]);

  // Detections by date
  const dateData = useMemo(() => {
    return Object.entries(stats.dateCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [stats.dateCounts]);

  // Day vs Night
  const dayNightData = useMemo(() => {
    const data = [];
    if (stats.dayCount > 0) data.push({ name: 'Day', value: stats.dayCount, fill: '#f59e0b' });
    if (stats.nightCount > 0) data.push({ name: 'Night', value: stats.nightCount, fill: '#3b82f6' });
    return data;
  }, [stats.dayCount, stats.nightCount]);

  if (filteredFires.length === 0) {
    return (
      <div className="charts-grid">
        <div className="empty-state">
          <p>No data available for charts. Adjust filters or fetch new data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="charts-grid">
      <ChartCard title="Detections by Confidence" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={confidenceData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="value" name="Detections" radius={[4, 4, 0, 0]}>
              {confidenceData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="FRP Distribution (MW)" icon={TrendingUp}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={frpDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Detections" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Detections by Date" icon={TrendingUp}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={dateData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="count"
              name="Detections"
              stroke="#06b6d4"
              fill="rgba(6, 182, 212, 0.2)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Day vs Night Observations" icon={Sun}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={dayNightData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {dayNightData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ color: '#94a3b8', fontSize: '11px' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
