'use client';
import useSWR from 'swr';
import { Building2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

// A "tenant" (business) is an account that owns bots. Super-admins are platform
// operators, not tenants, so they're excluded here.
export default function AdminTenantsPage() {
  const { data, isLoading } = useSWR('/platform/admin/users', fetcher);
  const tenants = (data?.users ?? []).filter((u: any) => u.role !== 'super_admin');

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3"><Building2 size={28} className="text-accent" /> Tenants</h1>
        <p className="text-secondary mt-2">Business accounts and the bots they run.</p>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Business', 'Email', 'Bots', 'Status', 'Joined'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : tenants.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted text-sm">No tenants yet.</td></tr>
              ) : tenants.map((t: any) => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{t.name}</td>
                  <td className="px-5 py-3.5 text-secondary">{t.email}</td>
                  <td className="px-5 py-3.5 text-secondary">{t._count?.memberships ?? 0}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${t.active ? 'bg-success/15 text-success' : 'bg-white/5 text-muted'}`}>{t.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
