'use client';
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';
import { Save, AlertCircle, CheckCircle, Power, Users, Trash2, Plus, X, Loader2 } from 'lucide-react';

const fetcher = (url: string) => apiFetch(url);

export default function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);

  const { data, isLoading, error: loadError } = useSWR(`/platform/bots/${slug}/settings`, fetcher);

  const [name, setName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (data?.settings) {
      setName(data.settings.name ?? '');
      setOwnerPhone(data.settings.ownerPhone ?? '');
      setActive(data.settings.active ?? true);
    }
  }, [data]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus('idle');
    setErrorMsg('');
    try {
      await apiFetch(`/platform/bots/${slug}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ name, ownerPhone, active }),
      });
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMsg(err.message ?? 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-8 text-secondary">Loading settings...</div>;
  if (loadError) return (
    <div className="p-8 text-danger flex items-center gap-2">
      <AlertCircle size={18} />
      Failed to load settings: {loadError.message ?? 'Unknown error'}
    </div>
  );

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Bot Settings</h1>
          <p className="text-secondary mt-2">Configure routing and notifications.</p>
        </div>
      </div>

      <div className="glass-panel p-8 max-w-2xl">
        {saveStatus === 'error' && (
          <div className="mb-6 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <div>
            <label className="label">Bot Name</label>
            <input 
              type="text" 
              className="input" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required
            />
          </div>

          <div>
            <label className="label">Owner WhatsApp Number (for alerts)</label>
            <input 
              type="text" 
              className="input" 
              value={ownerPhone} 
              onChange={e => setOwnerPhone(e.target.value)} 
              placeholder="e.g. 2348012345678"
              required
            />
            <div className="text-xs text-muted mt-2">
              Hot lead and human takeover notifications will be sent to this number.
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-lg border border-white/10 bg-white/3">
            <button
              type="button"
              onClick={() => setActive(a => !a)}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-white/20'}`}
              aria-label="Toggle bot active"
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2 font-medium">
                <Power size={16} className={active ? 'text-green-400' : 'text-muted'} />
                Bot is {active ? 'active' : 'paused'}
              </div>
              <div className="text-xs text-muted">
                {active
                  ? 'The bot will respond to incoming WhatsApp messages.'
                  : 'The bot will ignore incoming messages until reactivated.'}
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 mt-2 flex items-center gap-4">
            <button type="submit" className="btn btn-primary flex items-center gap-2" disabled={saving}>
              {saveStatus === 'ok' ? (
                <><CheckCircle size={16} /> Saved!</>
              ) : (
                <><Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}</>
              )}
            </button>
          </div>
        </form>
      </div>

      <MembersCard slug={slug} />
    </>
  );
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-accent/20 text-accent', admin: 'bg-warning/15 text-warning',
  member: 'bg-white/5 text-secondary', viewer: 'bg-white/5 text-muted',
};
const BOT_ROLES = ['owner', 'admin', 'member', 'viewer'];

// Per-bot member overrides (the per-bot half of the hybrid role model).
function MembersCard({ slug }: { slug: string }) {
  const { data, mutate } = useSWR(`/platform/bots/${slug}/members`, fetcher);
  const members: any[] = data?.members ?? [];
  const canManage: boolean = data?.canManage ?? false;
  const [adding, setAdding] = useState(false);

  const changeRole = async (userId: string, role: string) => {
    await apiFetch(`/platform/bots/${slug}/members/${userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    await mutate();
  };
  const remove = async (userId: string) => {
    if (!confirm('Remove this per-bot role? The user keeps any organization-level access.')) return;
    await apiFetch(`/platform/bots/${slug}/members/${userId}`, { method: 'DELETE' });
    await mutate();
  };

  return (
    <div className="glass-panel p-8 mt-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Users size={18} className="text-accent" /> Bot Members</h2>
        {canManage && (
          <button onClick={() => setAdding(true)} className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"><Plus size={14} /> Add</button>
        )}
      </div>
      <p className="text-secondary text-sm mb-5">Per-bot roles. These override a user’s organization role for this bot only.</p>

      {members.length === 0 ? (
        <div className="text-sm text-muted py-3">No per-bot overrides. Access is governed by organization roles.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {members.map(m => (
            <div key={m.userId} className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted truncate">{m.email}</div>
              </div>
              {canManage ? (
                <select className="input text-xs w-28 py-1" value={m.role} onChange={e => changeRole(m.userId, e.target.value)}>
                  {BOT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              ) : (
                <span className={`badge ${ROLE_BADGE[m.role] ?? ''}`}>{m.role}</span>
              )}
              {canManage && <button onClick={() => remove(m.userId)} className="text-danger hover:opacity-80"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddBotMember slug={slug} onClose={() => setAdding(false)} onDone={async () => { setAdding(false); await mutate(); }} />
      )}
    </div>
  );
}

function AddBotMember({ slug, onClose, onDone }: { slug: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch(`/platform/bots/${slug}/members`, { method: 'POST', body: JSON.stringify({ email, role }) });
      onDone();
    } catch (err: any) { setError(err.message ?? 'Failed to add member'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-8 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Add Bot Member</h2>
        <p className="text-secondary text-sm mb-6">Grant an existing user a role on this bot.</p>
        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.com" required />
          </div>
          <div>
            <label className="label">Role on this bot</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {BOT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Adding...</> : 'Add Member'}
          </button>
        </form>
      </div>
    </div>
  );
}
