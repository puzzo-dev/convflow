'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Building2, Loader2, Pencil, Plus, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { EditNameModal } from '../users/page';

const fetcher = (url: string) => apiFetch(url);

// A tenant is an Organization — a business that owns bots and has users by role.
export default function AdminTenantsPage() {
  const { data, isLoading, mutate } = useSWR('/platform/admin/organizations', fetcher);
  const orgs: any[] = data?.organizations ?? [];
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Building2 size={28} className="text-accent" /> Tenants</h1>
          <p className="text-secondary mt-2">Organizations — each owns bots and has its own users.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} /> Create Tenant
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Organization', 'Slug', 'Users', 'Bots', 'Created', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-muted"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : orgs.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-muted text-sm">No tenants yet.</td></tr>
              ) : orgs.map(o => (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3.5 font-medium">{o.name}</td>
                  <td className="px-5 py-3.5 text-xs text-muted font-mono">{o.slug}</td>
                  <td className="px-5 py-3.5 text-secondary">{o._count?.memberships ?? 0}</td>
                  <td className="px-5 py-3.5 text-secondary">{o._count?.bots ?? 0}</td>
                  <td className="px-5 py-3.5 text-secondary text-xs">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <button onClick={() => setEditing(o)} className="text-secondary hover:text-primary" title="Rename"><Pencil size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditNameModal
          title="Rename Organization"
          label="Organization name"
          initial={editing.name}
          onClose={() => setEditing(null)}
          onSave={async (name) => {
            await apiFetch(`/platform/admin/organizations/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
            await mutate();
            setEditing(null);
          }}
        />
      )}

      {creating && (
        <CreateTenantModal onClose={() => setCreating(false)} onCreated={async () => { setCreating(false); await mutate(); }} />
      )}
    </>
  );
}

function CreateTenantModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/platform/admin/organizations', { method: 'POST', body: JSON.stringify({ name, ownerEmail: ownerEmail || undefined }) });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create tenant');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Create Tenant</h2>
        <p className="text-secondary text-sm mb-6">Create an organization, optionally assigning an existing user as its owner.</p>
        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label className="label">Organization Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" required />
          </div>
          <div>
            <label className="label">Owner Email <span className="text-muted">(optional)</span></label>
            <input type="email" className="input" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} placeholder="owner@acme.com — must be an existing user" />
            <p className="text-[10px] text-muted mt-1">Leave blank to create an empty organization.</p>
          </div>
          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Tenant'}
          </button>
        </form>
      </div>
    </div>
  );
}
