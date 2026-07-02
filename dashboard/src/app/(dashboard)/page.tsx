'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { Activity, Zap, Bot, Users, MessageSquare, Flame, ShoppingCart, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface BotSummary { slug: string; name: string; active: boolean; openwaSessionId: string; createdAt: string; }

const fetcher = (url: string) => apiFetch(url);

const CLASS_COLOR: Record<string, string> = {
  hot: '#f87171', warm: '#fbbf24', nurture: '#e2603f', cold: '#6b6b74', order: '#4ade80',
};

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
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

export default function DashboardOverview() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role ?? (session as any)?.role;

  // Super admins land on the platform console, not the tenant overview.
  useEffect(() => {
    if (role === 'super_admin') router.replace('/admin');
  }, [role, router]);

  const { data: botsData, error, isLoading } = useSWR('/platform/bots', fetcher, { refreshInterval: 30_000 });
  const { data: ovData } = useSWR('/platform/overview', fetcher, { refreshInterval: 30_000 });
  const bots: BotSummary[] = botsData?.bots ?? [];
  const s = ovData?.stats ?? {};
  const byClass: Record<string, number> = s.byClassification ?? {};
  const classTotal = Object.values(byClass).reduce((a: number, b: number) => a + b, 0);

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Platform Overview</h1>
          <p className="text-secondary mt-2">Welcome back to ConvFlow.</p>
        </div>
        <Link href="/bots" className="btn btn-primary flex items-center gap-2">
          <Zap size={18} />
          Manage Bots
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <Stat icon={<Bot size={20} className="text-accent" />}            label="Bots"          value={s.botCount ?? 0}          sub={`${s.activeBots ?? 0} active`} />
        <Stat icon={<Users size={20} className="text-accent-secondary" />} label="Total Leads"   value={s.totalLeads ?? 0}        sub={`${s.hotLeads ?? 0} hot`} />
        <Stat icon={<ShoppingCart size={20} className="text-success" />}   label="Orders"        value={s.orders ?? 0}            sub="completed orders" />
        <Stat icon={<MessageSquare size={20} className="text-warning" />}  label="Conversations" value={s.totalConversations ?? 0} sub={`${s.recentInbound7d ?? 0} inbound (7d)`} />
      </div>

      {/* Lead classification breakdown */}
      <div className="glass-panel p-6 mb-6">
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2"><Flame size={16} className="text-accent" /> Lead Breakdown</h3>
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

      <div className="glass-panel p-6">
        <h3 className="mb-6 font-semibold text-lg">Your Bots</h3>

        {isLoading ? (
          <div className="py-12 text-center text-muted text-sm">Loading...</div>
        ) : error ? (
          <div className="py-12 text-center text-danger text-sm">
            <Activity size={20} className="inline mb-2" />
            <div>Failed to load bots. Check your connection and try again.</div>
          </div>
        ) : bots.length === 0 ? (
          <div className="py-12 text-center text-muted text-sm">
            No bots yet.{' '}
            <Link href="/bots" className="text-accent hover:underline">Create your first bot</Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="bg-surface p-4 text-secondary font-semibold text-sm uppercase tracking-wide border-b border-white/10">Bot Name</th>
                  <th className="bg-surface p-4 text-secondary font-semibold text-sm uppercase tracking-wide border-b border-white/10">Status</th>
                  <th className="bg-surface p-4 text-secondary font-semibold text-sm uppercase tracking-wide border-b border-white/10">Session ID</th>
                  <th className="bg-surface p-4 text-secondary font-semibold text-sm uppercase tracking-wide border-b border-white/10">Created</th>
                  <th className="bg-surface p-4 text-secondary font-semibold text-sm uppercase tracking-wide border-b border-white/10">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bots.map(bot => (
                  <tr key={bot.slug} className="hover:bg-surface-hover transition-colors border-b border-white/10 last:border-0">
                    <td className="p-4 font-medium flex items-center gap-2">
                      <Bot size={16} className="text-accent flex-shrink-0" />
                      {bot.name}
                    </td>
                    <td className="p-4">
                      <span className={`badge ${bot.active ? 'bg-success/20 text-success' : 'bg-white/10 text-muted'}`}>
                        {bot.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-muted font-mono">{bot.openwaSessionId}</td>
                    <td className="p-4 text-xs text-secondary">
                      {new Date(bot.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="p-4 flex gap-2">
                      <Link href={`/bots/${bot.slug}/leads`} className="btn btn-secondary px-3 py-1.5 text-xs">Leads</Link>
                      <Link href={`/bots/${bot.slug}/analytics`} className="btn btn-secondary px-3 py-1.5 text-xs">Analytics</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
