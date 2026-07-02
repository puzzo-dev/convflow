'use client';
import useSWR from 'swr';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Building2, Users, Boxes, Plug, UsersRound, MessageSquare, ShoppingCart, Flame,
  Inbox, ExternalLink, Radio, Activity,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

const CLASS_COLOR: Record<string, string> = {
  hot: '#f87171', warm: '#fbbf24', nurture: '#e2603f', cold: '#6b6b74', order: '#4ade80',
};

function Stat({ icon, label, value, sub, href, accent }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; href?: string; accent?: boolean;
}) {
  const inner = (
    <div className={`glass-panel p-6 flex flex-col gap-3 h-full transition-colors ${accent ? 'border-accent/40' : 'hover:border-accent/30'}`}>
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-secondary">{label}</span>
        {icon}
      </div>
      <div className="text-4xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminOverview() {
  // Live activity refreshes fast; everything else on a slower cadence.
  const { data: a } = useSWR('/platform/admin/analytics', fetcher, { refreshInterval: 15_000 });
  const { data: orgsData } = useSWR('/platform/admin/organizations', fetcher);
  const { data: pluginsData } = useSWR('/platform/admin/plugins', fetcher);

  const s = a?.stats ?? {};
  const daily: any[] = a?.dailyVolume ?? [];
  const topBots: any[] = a?.topBots ?? [];
  const liveByBot: any[] = a?.liveByBot ?? [];
  const orgs: any[] = orgsData?.organizations ?? [];
  const plugins: any[] = pluginsData?.plugins ?? [];

  const byClass: Record<string, number> = s.byClassification ?? {};
  const classTotal = Object.values(byClass).reduce((x: number, y: number) => x + y, 0);
  const maxTop = topBots.length ? Math.max(...topBots.map(b => b.leads)) : 1;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Platform Overview</h1>
        <p className="text-secondary mt-2">System-wide activity across all tenants.</p>
      </div>

      {/* Live activity — refreshes every 15s */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <Stat accent icon={<Radio size={20} className="text-success animate-pulse" />} label="Active Customers" value={s.activeCustomers ?? 0} sub="in a conversation right now" />
        <Stat accent icon={<Activity size={20} className="text-success" />}            label="Live Bots"        value={s.liveBots ?? 0} sub={`of ${s.activeBots ?? 0} active bots`} />
        <Stat icon={<UsersRound size={20} className="text-accent" />}                  label="Total Leads"      value={s.totalLeads ?? 0} sub={`${s.hotLeads ?? 0} hot`} />
        <Stat icon={<ShoppingCart size={20} className="text-success" />}               label="Orders"           value={s.totalOrders ?? 0} sub="captured all-time" />
      </div>

      {/* Entity + volume counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <Stat icon={<Building2 size={20} className="text-accent" />}       label="Tenants"       value={s.orgCount ?? 0} sub="organizations" href="/admin/tenants" />
        <Stat icon={<Users size={20} className="text-accent-secondary" />} label="Users"         value={s.userCount ?? 0} href="/admin/users" />
        <Stat icon={<Boxes size={20} className="text-success" />}          label="Bots"          value={s.botCount ?? 0} sub={`${s.activeBots ?? 0} active`} href="/admin/bots" />
        <Stat icon={<MessageSquare size={20} className="text-warning" />}  label="Conversations" value={s.totalConversations ?? 0} sub="messages logged" />
      </div>

      {/* Daily performance chart */}
      <div className="glass-panel p-6 mb-6">
        <h3 className="font-semibold text-base mb-5 flex items-center gap-2"><Activity size={16} className="text-accent" /> Activity — last 30 days</h3>
        {daily.length === 0 ? (
          <div className="text-sm text-muted py-8 text-center flex items-center justify-center gap-2"><Inbox size={16} /> No activity yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e2603f" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#e2603f" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c9a27a" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#c9a27a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#fafafa' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
              <Area type="monotone" dataKey="conversations" stroke="#c9a27a" fill="url(#gConv)" name="Conversations" strokeWidth={2} />
              <Area type="monotone" dataKey="leads" stroke="#e2603f" fill="url(#gLeads)" name="Leads" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top bots by leads */}
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-4">Top Bots by Leads</h3>
          {topBots.length === 0 ? <div className="text-sm text-muted py-3">No leads yet.</div> : (
            <div className="flex flex-col gap-3">
              {topBots.map(b => (
                <Link key={b.slug} href={`/bots/${b.slug}/analytics`} className="flex items-center gap-3 group">
                  <div className="w-28 text-sm truncate group-hover:text-accent transition-colors">{b.name}</div>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(b.leads / maxTop) * 100}%` }} />
                  </div>
                  <div className="w-10 text-right text-sm text-secondary">{b.leads}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Live now, by bot */}
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2"><Radio size={15} className="text-success animate-pulse" /> Live Now</h3>
          {liveByBot.length === 0 ? (
            <div className="text-sm text-muted py-3">No customers active right now.</div>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {liveByBot.map(b => (
                <Link key={b.slug} href={`/bots/${b.slug}/conversations`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent transition-colors">
                  <span className="font-medium truncate">{b.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-success flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> {b.active} active
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lead breakdown + recent tenants */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h3 className="font-semibold text-base mb-4 flex items-center gap-2"><Flame size={16} className="text-accent" /> Lead Breakdown</h3>
          {classTotal === 0 ? (
            <div className="text-sm text-muted py-3 flex items-center gap-2"><Inbox size={16} /> No leads yet.</div>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-4">
                {Object.entries(byClass).map(([k, v]) => (
                  <div key={k} style={{ width: `${(v / classTotal) * 100}%`, background: CLASS_COLOR[k] ?? '#6b6b74' }} title={`${k}: ${v}`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-4">
                {Object.entries(byClass).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLASS_COLOR[k] ?? '#6b6b74' }} />
                    <span className="text-secondary capitalize">{k}</span>
                    <span className="text-muted">{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Recent Tenants</h3>
            <Link href="/admin/tenants" className="text-accent text-xs hover:opacity-80 flex items-center gap-1">All <ExternalLink size={11} /></Link>
          </div>
          <div className="flex flex-col divide-y divide-white/5">
            {orgs.length === 0 ? <div className="text-sm text-muted py-3">No tenants yet.</div> :
              orgs.slice(0, 5).map(o => (
                <div key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium truncate">{o.name}</span>
                  <span className="text-xs text-muted flex-shrink-0">{o._count?.bots ?? 0} bots · {o._count?.memberships ?? 0} users</span>
                </div>
              ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 text-xs text-muted">{plugins.length} plugins installed</div>
        </div>
      </div>
    </>
  );
}
