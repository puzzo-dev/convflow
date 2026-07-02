'use client';
import useSWR, { mutate } from 'swr';
import { Shield, Loader2, UserX, ShieldCheck, ShieldOff } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const USERS_URL = '/platform/admin/users';
const fetcher = (url: string) => apiFetch(url);

export default function AdminUsersPage() {
  const { data, isLoading } = useSWR(USERS_URL, fetcher);
  const users = data?.users ?? [];

  const toggleRole = async (id: string, role: 'member' | 'super_admin') => {
    await apiFetch(`${USERS_URL}/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    await mutate(USERS_URL);
  };

  const deactivate = async (id: string) => {
    if (!confirm('Deactivate this user? They will be signed out immediately and unable to log in.')) return;
    await apiFetch(`${USERS_URL}/${id}`, { method: 'DELETE' });
    await mutate(USERS_URL);
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield size={28} className="text-accent" />
            All Users
          </h1>
          <p className="text-secondary mt-2">Super-admin view of all dashboard users.</p>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Active', 'Orgs', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-muted">
                    <Loader2 size={24} className="animate-spin mx-auto" />
                  </td>
                </tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{u.name}</td>
                  <td className="px-5 py-3.5 text-secondary">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${u.role === 'super_admin' ? 'bg-accent/20 text-accent' : 'bg-white/5 text-secondary'}`}>
                      {u.role === 'super_admin' ? 'Super Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${u.active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary">{u._count?.orgMemberships ?? 0}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRole(u.id, u.role === 'super_admin' ? 'member' : 'super_admin')}
                        className="btn btn-sm btn-ghost"
                        title={u.role === 'super_admin' ? 'Demote to member' : 'Promote to super admin'}
                      >
                        {u.role === 'super_admin' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                      </button>
                      <button
                        onClick={() => deactivate(u.id)}
                        disabled={!u.active}
                        className="btn btn-sm btn-ghost text-red-400 disabled:opacity-40"
                        title="Deactivate user"
                      >
                        <UserX size={16} />
                      </button>
                    </div>
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
