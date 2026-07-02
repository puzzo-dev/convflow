'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Bell, Plus, Trash2, Send, Loader2, Mail, MessageSquare, Phone, X, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

type Kind = 'email' | 'whatsapp' | 'sms';

interface CredField { key: string; label: string; secret?: boolean; optional?: boolean; placeholder?: string; }
interface Channel { id: string; kind: Kind; provider: string; label: string | null; target: string | null; enabled: boolean; createdAt: string; }

const KIND_ICON: Record<Kind, React.ReactNode> = {
  email:    <Mail size={16} />,
  whatsapp: <MessageSquare size={16} />,
  sms:      <Phone size={16} />,
};
const KIND_LABEL: Record<Kind, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS' };
const TARGET_HINT: Record<Kind, string> = {
  email:    'Destination email address',
  whatsapp: 'Destination number (e.g. 2348012345678)',
  sms:      'Destination number (e.g. +2348012345678)',
};

export default function NotificationsPage() {
  const { data: meta }      = useSWR('/platform/notifications/providers', fetcher);
  const { data, mutate }    = useSWR('/platform/notifications/channels', fetcher);
  const channels: Channel[] = data?.channels ?? [];

  const providersByKind: Record<Kind, string[]>       = meta?.providersByKind ?? { email: [], whatsapp: [], sms: [] };
  const providerFields:  Record<string, CredField[]>  = meta?.providerFields  ?? {};

  const [showForm, setShowForm] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const toggleEnabled = async (c: Channel) => {
    await apiFetch(`/platform/notifications/channels/${c.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !c.enabled }) });
    await mutate();
  };
  const remove = async (c: Channel) => {
    if (!confirm(`Delete this ${KIND_LABEL[c.kind]} channel?`)) return;
    await apiFetch(`/platform/notifications/channels/${c.id}`, { method: 'DELETE' });
    await mutate();
  };
  const test = async (c: Channel) => {
    setTesting(c.id);
    setTestResult(r => ({ ...r, [c.id]: undefined as any }));
    try {
      const res = await apiFetch(`/platform/notifications/channels/${c.id}/test`, { method: 'POST' });
      setTestResult(r => ({ ...r, [c.id]: { ok: res.ok, msg: res.ok ? 'Sent!' : (res.error ?? 'Failed') } }));
    } catch (err: any) {
      setTestResult(r => ({ ...r, [c.id]: { ok: false, msg: err.message } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Bell size={28} className="text-accent" /> Notifications</h1>
          <p className="text-secondary mt-2">
            Your delivery channels. Flows notify you through these; channels you don’t set fall back to platform defaults.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} /> Add Channel
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        {channels.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No channels yet. Add one to control where lead alerts are delivered.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {channels.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                  {KIND_ICON[c.kind]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {c.label || KIND_LABEL[c.kind]}
                    <span className="badge bg-white/5 text-muted text-[10px] normal-case">{c.provider}</span>
                  </div>
                  <div className="text-xs text-muted truncate">{c.target || 'no destination set'}</div>
                  {testResult[c.id] && (
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${testResult[c.id].ok ? 'text-success' : 'text-danger'}`}>
                      {testResult[c.id].ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />} {testResult[c.id].msg}
                    </div>
                  )}
                </div>
                <button onClick={() => test(c)} disabled={testing === c.id}
                  className="btn btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
                  {testing === c.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test
                </button>
                <button onClick={() => toggleEnabled(c)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${c.enabled ? 'bg-accent' : 'bg-white/20'}`}
                  title={c.enabled ? 'Enabled' : 'Disabled'}>
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${c.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <button onClick={() => remove(c)} className="text-danger hover:opacity-80 flex-shrink-0"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <AddChannelForm
          providersByKind={providersByKind}
          providerFields={providerFields}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await mutate(); }}
        />
      )}
    </>
  );
}

function AddChannelForm({ providersByKind, providerFields, onClose, onSaved }: {
  providersByKind: Record<Kind, string[]>;
  providerFields: Record<string, CredField[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind]         = useState<Kind>('whatsapp');
  const providers              = providersByKind[kind] ?? [];
  const [provider, setProvider] = useState(providers[0] ?? '');
  const [label, setLabel]       = useState('');
  const [target, setTarget]     = useState('');
  const [creds, setCreds]       = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const fields = providerFields[provider] ?? [];

  const onKindChange = (k: Kind) => {
    setKind(k);
    const p = (providersByKind[k] ?? [])[0] ?? '';
    setProvider(p);
    setCreds({});
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await apiFetch('/platform/notifications/channels', {
        method: 'POST',
        body: JSON.stringify({ kind, provider, label: label || null, target: target || null, credentials: creds }),
      });
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save channel');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-xl p-8 relative max-h-[90vh] overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Add Notification Channel</h2>
        <p className="text-secondary text-sm mb-6">Credentials are encrypted at rest and never shown again.</p>

        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">{error}</div>}

        <form onSubmit={save} className="flex flex-col gap-5">
          <div>
            <label className="label">Channel type</label>
            <div className="flex gap-2">
              {(['whatsapp', 'email', 'sms'] as Kind[]).map(k => (
                <button key={k} type="button" onClick={() => onKindChange(k)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm border transition-colors ${
                    kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-white/10 text-secondary hover:bg-white/5'}`}>
                  {KIND_ICON[k]} {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          {providers.length > 1 && (
            <div>
              <label className="label">Provider</label>
              <select className="input" value={provider} onChange={e => { setProvider(e.target.value); setCreds({}); }}>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="label">{TARGET_HINT[kind]}</label>
            <input className="input" value={target} onChange={e => setTarget(e.target.value)}
              placeholder={kind === 'email' ? 'alerts@yourco.com' : '2348012345678'} required />
          </div>

          {/* Credential fields — two columns to fill the wider dialog. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="label">{f.label}{f.optional ? ' (optional)' : ''}</label>
                <input
                  className="input"
                  type={f.secret ? 'password' : 'text'}
                  value={creds[f.key] ?? ''}
                  onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  required={!f.optional}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="label">Label (optional)</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Sales team inbox" />
          </div>

          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Channel'}
          </button>
        </form>
      </div>
    </div>
  );
}
