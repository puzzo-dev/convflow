'use client';
import { useEffect } from 'react';
import useSWR from 'swr';
import { Activity, Zap, Bot } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface BotSummary { slug: string; name: string; active: boolean; openwaSessionId: string; createdAt: string; }

const fetcher = (url: string) => apiFetch(url);

export default function DashboardOverview() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role ?? (session as any)?.role;

  // Super admins land on the platform console, not the tenant overview.
  useEffect(() => {
    if (role === 'super_admin') router.replace('/admin');
  }, [role, router]);

  const { data: botsData, error, isLoading } = useSWR('/platform/bots', fetcher, { refreshInterval: 30_000 });
  const bots: BotSummary[] = botsData?.bots ?? [];

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
