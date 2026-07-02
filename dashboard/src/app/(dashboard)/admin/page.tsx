'use client';
import useSWR from 'swr';
import Link from 'next/link';
import {
  Building2, Users, Boxes, Plug, UsersRound, MessageSquare, ShoppingCart, Flame, Inbox, ExternalLink,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

const CLASS_COLOR: Record<string, string> = {
  hot: '#f87171', warm: '#fbbf24', nurture: '#e2603f', cold: '#6b6b74', order: '#4ade80',
};

function Stat({ icon, label, value, sub, href }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; href?: string;
}) {
  const inner = (
    <div className="glass-panel p-6 flex flex-col gap-3 h-full hover:border-accent/30 transition-colors">
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
  const { data: usersData }   = useSWR('/platform/admin/users', fetcher);
  const { data: orgsData }    = useSWR('/platform/admin/organizations', fetcher);
  const { data: botsData }    = useSWR('/platform/bots', fetcher);
  const { data: pluginsData } = useSWR('/platform/admin/plugins', fetcher);
  const { data: ovData }      = useSWR('/platform/overview', fetcher);

  const users:   any[] = usersData?.users ?? [];
  const orgs:    any[] = orgsData?.organizations ?? [];
  const bots:    any[] = botsData?.bots ?? [];
  const plugins: any[] = pluginsData?.plugins ?? [];
  const s = ovData?.stats ?? {};
  const byClass: Record<string, number> = s.byClassification ?? {};
  const classTotal = Object.values(byClass).reduce((a: number, b: number) => a + b, 0);

  const activeBots = bots.filter(b => b.active).length;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Platform Overview</h1>
        <p className="text-secondary mt-2">System-wide view across all tenants.</p>
      </div>

      {/* Entity counts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <Stat icon={<Building2 size={20} className="text-accent" />}       label="Tenants" value={orgs.length}    sub="organizations" href="/admin/tenants" />
        <Stat icon={<Users size={20} className="text-accent-secondary" />} label="Users"   value={users.length}   sub={`${users.filter(u => u.active).length} active`} href="/admin/users" />
        <Stat icon={<Boxes size={20} className="text-success" />}          label="Bots"    value={bots.length}    sub={`${activeBots} active`} href="/admin/bots" />
        <Stat icon={<Plug size={20} className="text-warning" />}           label="Plugins" value={plugins.length} sub="connectors" href="/admin/plugins" />
      </div>

      {/* Platform activity (aggregated across all bots) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <Stat icon={<UsersRound size={20} className="text-accent" />}     label="Total Leads"   value={s.totalLeads ?? 0} sub={`${s.hotLeads ?? 0} hot`} />
        <Stat icon={<ShoppingCart size={20} className="text-success" />}  label="Orders"        value={s.orders ?? 0} sub="completed" />
        <Stat icon={<MessageSquare size={20} className="text-warning" />} label="Conversations" value={s.totalConversations ?? 0} sub={`${s.recentInbound7d ?? 0} inbound (7d)`} />
        <Stat icon={<Flame size={20} className="text-danger" />}          label="Hot Rate"      value={`${s.totalLeads ? Math.round(((s.hotLeads ?? 0) / s.totalLeads) * 100) : 0}%`} sub="hot / total leads" />
      </div>

      {/* Lead breakdown */}
      <div className="glass-panel p-6 mb-6">
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2"><Flame size={16} className="text-accent" /> Lead Breakdown (all tenants)</h3>
        {classTotal === 0 ? (
          <div className="text-sm text-muted py-4 flex items-center gap-2"><Inbox size={16} /> No leads captured yet.</div>
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

      {/* Recent tenants + bots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Recent Bots</h3>
            <Link href="/admin/bots" className="text-accent text-xs hover:opacity-80 flex items-center gap-1">All <ExternalLink size={11} /></Link>
          </div>
          <div className="flex flex-col divide-y divide-white/5">
            {bots.length === 0 ? <div className="text-sm text-muted py-3">No bots yet.</div> :
              bots.slice(0, 5).map(b => (
                <Link key={b.slug} href={`/bots/${b.slug}/flows`} className="flex items-center justify-between py-2.5 text-sm hover:text-accent transition-colors">
                  <span className="font-medium truncate">{b.name}</span>
                  <span className={`badge text-[9px] flex-shrink-0 ${b.active ? 'bg-success/15 text-success' : 'bg-white/5 text-muted'}`}>{b.active ? 'active' : 'inactive'}</span>
                </Link>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}
