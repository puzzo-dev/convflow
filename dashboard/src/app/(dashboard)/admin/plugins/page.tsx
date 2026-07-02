'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Plug, Loader2, Plus, Trash2, X, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

interface AdminPlugin { pluginId: string; name: string; version: string; enabled: boolean; builtin: boolean; actionsCount: number; }

const EXAMPLE = `{
  "id": "shopify",
  "name": "Shopify",
  "credentials": { "source": "stored", "fields": [
    { "key": "storeUrl", "label": "Store URL" },
    { "key": "token", "label": "Admin API token", "secret": true }
  ]},
  "actions": [
    { "id": "create_customer", "label": "Create Customer", "verb": "POST",
      "url": "{creds.storeUrl}/admin/api/2024-01/customers.json",
      "headers": { "X-Shopify-Access-Token": "{creds.token}" },
      "bodyFrom": "fields",
      "inputs": [ { "key": "fields", "label": "Field mapping", "type": "fieldmap", "required": true } ] }
  ]
}`;

export default function AdminPluginsPage() {
  const { data, isLoading, mutate } = useSWR('/platform/admin/plugins', fetcher);
  const plugins: AdminPlugin[] = data?.plugins ?? [];
  const [showInstall, setShowInstall] = useState(false);

  const toggle = async (p: AdminPlugin) => {
    await apiFetch(`/platform/admin/plugins/${p.pluginId}`, { method: 'PATCH', body: JSON.stringify({ enabled: !p.enabled }) });
    await mutate();
  };
  const uninstall = async (p: AdminPlugin) => {
    if (!confirm(`Uninstall "${p.name}"? Flows using it will stop working.`)) return;
    await apiFetch(`/platform/admin/plugins/${p.pluginId}`, { method: 'DELETE' });
    await mutate();
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3"><Plug size={28} className="text-accent" /> Plugins</h1>
          <p className="text-secondary mt-2">
            Global connectors, installable at runtime. Credentials are configured per tenant.
          </p>
        </div>
        <button onClick={() => setShowInstall(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} /> Install Plugin
        </button>
      </div>

      {isLoading ? (
        <div className="glass-panel p-16 text-center"><Loader2 size={24} className="animate-spin mx-auto text-accent" /></div>
      ) : (
        <div className="flex flex-col gap-4 max-w-3xl">
          {plugins.map(p => (
            <div key={p.pluginId} className="glass-panel p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent flex-shrink-0">
                <Plug size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-center gap-2">
                  {p.name}
                  {p.builtin
                    ? <span className="badge bg-accent/15 text-accent text-[9px]">built-in</span>
                    : <span className="badge bg-white/5 text-muted text-[9px] normal-case">v{p.version}</span>}
                </div>
                <div className="text-xs text-muted">{p.pluginId} · {p.actionsCount} actions</div>
              </div>

              {p.builtin ? (
                <span className="text-xs text-muted">always on</span>
              ) : (
                <>
                  <button onClick={() => toggle(p)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${p.enabled ? 'bg-accent' : 'bg-white/20'}`}
                    title={p.enabled ? 'Enabled' : 'Disabled'}>
                    <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <button onClick={() => uninstall(p)} className="text-danger hover:opacity-80"><Trash2 size={16} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showInstall && <InstallModal onClose={() => setShowInstall(false)} onInstalled={async () => { setShowInstall(false); await mutate(); }} />}
    </>
  );
}

function InstallModal({ onClose, onInstalled }: { onClose: () => void; onInstalled: () => void }) {
  const [text, setText]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const install = async () => {
    setSaving(true); setError('');
    let manifest: any;
    try {
      manifest = JSON.parse(text);
    } catch {
      setSaving(false); setError('Not valid JSON.'); return;
    }
    try {
      await apiFetch('/platform/admin/plugins', { method: 'POST', body: JSON.stringify({ manifest }) });
      onInstalled();
    } catch (err: any) {
      setError(err.message ?? 'Install failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-2xl p-8 relative max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Install Plugin</h2>
        <p className="text-secondary text-sm mb-4">Paste a plugin manifest (JSON). It's validated before install; no redeploy needed.</p>

        {error && (
          <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        <textarea
          className="input font-mono text-xs w-full resize-y"
          rows={16}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={EXAMPLE}
        />
        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setText(EXAMPLE)} className="text-accent text-xs hover:opacity-80">Load example</button>
          <button onClick={install} disabled={saving || !text.trim()} className="btn btn-primary flex items-center gap-2">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Installing...</> : 'Install'}
          </button>
        </div>
      </div>
    </div>
  );
}
