'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { Boxes, Loader2, ExternalLink } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

// GET /platform/bots returns ALL bots when the caller is a super-admin.
export default function AdminBotsPage() {
  const { data, isLoading } = useSWR('/platform/bots', fetcher);
  const bots: any[] = data?.bots ?? [];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3"><Boxes size={28} className="text-accent" /> All Bots</h1>
        <p className="text-secondary mt-2">Every bot across all tenants.</p>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Name', 'Session', 'Status', 'Created', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : bots.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted text-sm">No bots yet.</td></tr>
              ) : bots.map((b: any) => (
                <tr key={b.slug} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{b.name}</td>
                  <td className="px-5 py-3.5 text-xs text-muted font-mono">{b.openwaSessionId}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${b.active ? 'bg-success/15 text-success' : 'bg-white/5 text-muted'}`}>{b.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{new Date(b.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <Link href={`/bots/${b.slug}/flows`} className="text-accent hover:opacity-80 flex items-center gap-1 text-xs">
                      Open <ExternalLink size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
