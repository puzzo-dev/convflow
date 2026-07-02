'use client';
import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Shield, Loader2, UserX, UserCheck, ShieldCheck, ShieldOff, Pencil, X, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const USERS_URL = '/platform/admin/users';
const fetcher = (url: string) => apiFetch(url);

interface AdminUser { id: string; name: string; email: string; role: string; active: boolean; createdAt: string; _count?: { orgMemberships: number }; }

export default function AdminUsersPage() {
  const { data, isLoading } = useSWR(USERS_URL, fetcher);
  const users: AdminUser[] = data?.users ?? [];
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  const toggleRole = async (u: AdminUser) => {
    await apiFetch(`${USERS_URL}/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: u.role === 'super_admin' ? 'member' : 'super_admin' }) });
    await mutate(USERS_URL);
  };

  const toggleActive = async (u: AdminUser) => {
    if (u.active && !confirm('Deactivate this user? They will be signed out immediately and unable to log in.')) return;
    await apiFetch(`${USERS_URL}/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) });
    await mutate(USERS_URL);
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Shield size={28} className="text-accent" /> All Users</h1>
          <p className="text-secondary mt-2">Super-admin view of all dashboard users.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} /> Create User
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Active', 'Orgs', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center text-muted"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{u.name}</td>
                  <td className="px-5 py-3.5 text-secondary">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${u.role === 'super_admin' ? 'bg-accent/20 text-accent' : 'bg-white/5 text-secondary'}`}>
                      {u.role === 'super_admin' ? 'Super Admin' : 'Member'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`badge ${u.active ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger'}`}>{u.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-secondary">{u._count?.orgMemberships ?? 0}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(u)} className="text-secondary hover:text-primary" title="Edit name"><Pencil size={15} /></button>
                      <button onClick={() => toggleRole(u)} className="text-secondary hover:text-primary"
                        title={u.role === 'super_admin' ? 'Demote to member' : 'Promote to super admin'}>
                        {u.role === 'super_admin' ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                      </button>
                      <button onClick={() => toggleActive(u)}
                        className={u.active ? 'text-danger hover:opacity-80' : 'text-success hover:opacity-80'}
                        title={u.active ? 'Deactivate user' : 'Reactivate user'}>
                        {u.active ? <UserX size={16} /> : <UserCheck size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditNameModal
          title="Edit User"
          label="Full name"
          initial={editing.name}
          onClose={() => setEditing(null)}
          onSave={async (name) => {
            await apiFetch(`${USERS_URL}/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
            await mutate(USERS_URL);
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <CreateUserModal onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await mutate(USERS_URL); }} />
      )}
    </>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/platform/admin/users', { method: 'POST', body: JSON.stringify(form) });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-6">Create User</h2>
        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Platform Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="member">Member</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Temporary Password</label>
            <input type="text" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} placeholder="min 8 characters" required />
          </div>
          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create User'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Small reusable single-field edit modal.
export function EditNameModal({ title, label, initial, onClose, onSave }: {
  title: string; label: string; initial: string; onClose: () => void; onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) { setError('Cannot be empty'); return; }
    setSaving(true); setError('');
    try { await onSave(value.trim()); }
    catch (err: any) { setError(err.message ?? 'Failed to save'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-6">{title}</h2>
        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label className="label">{label}</label>
            <input className="input" value={value} onChange={e => setValue(e.target.value)} autoFocus required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
