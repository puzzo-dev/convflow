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
    </>
  );
}
