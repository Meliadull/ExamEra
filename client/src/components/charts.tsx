import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFormat, useI18n } from '../i18n';
import type { Point } from '../types';
import { Empty } from './ui';

export const BUCKET_COLORS: Record<string, string> = {
  '90-100': '#22c55e',
  '70-89': '#3b82f6',
  '50-69': '#f59e0b',
  '0-49': '#ef4444',
};

export function TrendChart({ data, height = 230 }: { data: Point[]; height?: number }) {
  const f = useFormat();
  const { t } = useI18n();
  if (!data.length) return <Empty title={t('common.noData')} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eef1f6" vertical={false} />
        <XAxis dataKey="date" tickFormatter={f.shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v: number) => [`${v}%`, t('analytics.avgResult')]}
          labelFormatter={(l: string) => f.date(l)}
          contentStyle={{ borderRadius: 10, border: '1px solid #e6eaf2', fontSize: 12.5 }}
        />
        <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: '#2563eb', strokeWidth: 0 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DistributionDonut({ data, centerLabel }: { data: { bucket: string; count: number }[]; centerLabel: string }) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  const label: Record<string, string> = {
    '90-100': '90–100%',
    '70-89': '70–89%',
    '50-69': '50–69%',
    '0-49': t('analytics.below50'),
  };
  if (!total) return <Empty title={t('common.noData')} />;
  return (
    <div className="row" style={{ gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div className="ring" style={{ width: 170, height: 170 }}>
        <ResponsiveContainer width={170} height={170}>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="bucket" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="val">
          <b style={{ fontSize: 26 }}>{total}</b>
          <span className="small muted">{centerLabel}</span>
        </div>
      </div>
      <div className="legend" style={{ minWidth: 160, flex: 1 }}>
        {data.map((d) => (
          <div className="legend-item" key={d.bucket}>
            <i style={{ background: BUCKET_COLORS[d.bucket] }} />
            {label[d.bucket]}
            <b>{Math.round((d.count / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bars({ items, max = 100, suffix = '%' }: { items: { label: string; value: number | null }[]; max?: number; suffix?: string }) {
  const { t } = useI18n();
  if (!items.length) return <Empty title={t('common.noData')} />;
  return (
    <div>
      {items.map((i) => (
        <div className="bar-row" key={i.label}>
          <span className="ellipsis" title={i.label}>
            {i.label}
          </span>
          <div className="bar">
            <div style={{ width: `${((i.value ?? 0) / max) * 100}%` }} />
          </div>
          <span className="right bold small">
            {i.value ?? '—'}
            {i.value != null ? suffix : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoreRing({ value, size = 170, color }: { value: number; size?: number; color?: string }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = color ?? (value >= 70 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444');
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} style={{ stroke: 'var(--track)' }} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={col}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s' }}
        />
      </svg>
      <div className="val">
        <b>{Math.round(value * 10) / 10}%</b>
      </div>
    </div>
  );
}
