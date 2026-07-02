'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Users, MessageSquare, Zap, TrendingUp, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

const CLASSIFICATION_COLORS: Record<string, string> = {
  hot:     '#f87171',  // danger
  warm:    '#fbbf24',  // warning
  nurture: '#e2603f',  // accent (terracotta)
  cold:    '#6b6b74',  // muted
  order:   '#4ade80',  // success
};

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass-panel p-6 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-secondary">{label}</span>
        {icon}
      </div>
      <div className="text-4xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  const { data, isLoading } = useSWR(
    `/platform/bots/${slug}/analytics?period=${period}`,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const stats = data?.stats ?? {};
  const byClass = stats.byClassification ?? {};
  const pieData = Object.entries(byClass).map(([k, v]) => ({ name: k, value: v as number }));

  const dailyVolume: { date: string; inbound: number; outbound: number }[] = stats.dailyVolume ?? [];
  const topSources: { source: string; count: number }[] = stats.topSources ?? [];

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-secondary mt-2">Visualise your bot's performance over time.</p>
        </div>
        <div className="flex gap-2">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                period === p ? 'bg-accent text-white' : 'btn btn-secondary'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
        <StatCard
          icon={<Users size={20} className="text-accent" />}
          label="Total Leads"
          value={isLoading ? '...' : stats.totalLeads ?? 0}
          sub={`${byClass.hot ?? 0} hot this period`}
        />
        <StatCard
          icon={<ShoppingCart size={20} className="text-success" />}
          label="Orders"
          value={isLoading ? '...' : byClass.order ?? 0}
          sub="From create_order terminal"
        />
        <StatCard
          icon={<MessageSquare size={20} className="text-accent-secondary" />}
          label="Conversations"
          value={isLoading ? '...' : stats.totalConversations ?? 0}
          sub={`${stats.totalOutbound ?? 0} bot replies`}
        />
        <StatCard
          icon={<Zap size={20} className="text-danger" />}
          label="Avg Lead Score"
          value={isLoading ? '...' : `${stats.avgLeadScore ?? 0} / 12`}
          sub="Across all scored leads"
        />
        <StatCard
          icon={<TrendingUp size={20} className="text-success" />}
          label="Hot Rate"
          value={isLoading ? '...' : `${stats.totalLeads ? Math.round(((byClass.hot ?? 0) / stats.totalLeads) * 100) : 0}%`}
          sub="Hot leads / total leads"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Daily Volume */}
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-5">Daily Volume</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyVolume} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                labelStyle={{ color: '#fafafa' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
              <Bar dataKey="inbound"  fill="#e2603f" radius={[4,4,0,0]} name="Inbound"  />
              <Bar dataKey="outbound" fill="#c9a27a" radius={[4,4,0,0]} name="Bot Replies" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Classification Pie */}
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-5">Lead Classification</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={CLASSIFICATION_COLORS[entry.name] ?? '#e2603f'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Sources */}
      {topSources.length > 0 && (
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-5">Top Lead Sources</h3>
          <div className="flex flex-col gap-3">
            {topSources.map(s => (
              <div key={s.source} className="flex items-center gap-4">
                <div className="w-24 text-sm text-secondary capitalize">{s.source}</div>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${topSources[0] ? (s.count / topSources[0].count) * 100 : 0}%` }}
                  />
                </div>
                <div className="text-sm text-secondary w-8 text-right">{s.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
