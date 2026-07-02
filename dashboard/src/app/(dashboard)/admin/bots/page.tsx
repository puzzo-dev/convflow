'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Boxes, Loader2, ExternalLink, Plus, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

// GET /platform/bots returns ALL bots when the caller is a super-admin.
export default function AdminBotsPage() {
  const { data, isLoading, mutate } = useSWR('/platform/bots', fetcher);
  const bots: any[] = data?.bots ?? [];
  const [showCreate, setShowCreate] = useState(false);

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Boxes size={28} className="text-accent" /> All Bots</h1>
          <p className="text-secondary mt-2">Every bot across all tenants.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} /> Create Bot
        </button>
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

      {showCreate && (
        <CreateBotModal onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await mutate(); }} />
      )}
    </>
  );
}

function CreateBotModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: orgData } = useSWR('/platform/admin/organizations', fetcher);
  const orgs: any[] = orgData?.organizations ?? [];

  const [form, setForm] = useState({ name: '', ownerPhone: '', websiteUrl: '', organizationId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.organizationId) { setError('Select an organization to assign this bot to.'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/platform/bots', { method: 'POST', body: JSON.stringify(form) });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create bot');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg p-8 relative max-h-[90vh] overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Create Bot</h2>
        <p className="text-secondary text-sm mb-6">As a super admin, assign this bot to any organization.</p>

        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label className="label">Organization</label>
            <select className="input" value={form.organizationId} onChange={e => setForm(f => ({ ...f, organizationId: e.target.value }))} required>
              <option value="">Select organization…</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Business Name</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Corp" required />
            </div>
            <div>
              <label className="label">Owner WhatsApp Number</label>
              <input className="input" value={form.ownerPhone} onChange={e => setForm(f => ({ ...f, ownerPhone: e.target.value }))} placeholder="2348012345678" required />
            </div>
          </div>
          <div>
            <label className="label">Website URL <span className="text-muted">(optional)</span></label>
            <input className="input" value={form.websiteUrl} onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))} placeholder="https://yoursite.com" />
          </div>
          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Bot'}
          </button>
        </form>
      </div>
    </div>
  );
}
