'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';
import { Database, Link2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';

const fetcher = (url: string) => apiFetch(url);

export default function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);

  const { data, mutate, isLoading: statusLoading, error: statusError } = useSWR(
    `/platform/bots/${slug}/erpnext/status`, fetcher
  );
  const isConnected = data?.connected === true;

  // Synced item catalog — only fetched once connected.
  const { data: itemsData, mutate: mutateItems } = useSWR(
    isConnected ? `/platform/bots/${slug}/erpnext/items` : null,
    fetcher,
  );
  const items: { itemCode: string; itemName: string; standardRate: number; currency: string }[] =
    itemsData?.items ?? [];

  const [erpnextUrl, setErpnextUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count?: number; error?: string } | null>(null);
  const [connectError, setConnectError] = useState('');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      await apiFetch(`/platform/bots/${slug}/erpnext/connect`, {
        method: 'POST',
        body: JSON.stringify({ erpnextUrl, apiKey, apiSecret }),
      });
      await mutate();
    } catch (err: any) {
      setConnectError(err.message ?? 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect ERPNext?')) return;
    try {
      await apiFetch(`/platform/bots/${slug}/erpnext/disconnect`, { method: 'DELETE' });
      await mutate();
      setSyncResult(null);
    } catch (err: any) {
      alert('Failed to disconnect: ' + err.message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch(`/platform/bots/${slug}/erpnext/sync-items`, { method: 'POST' });
      setSyncResult({ count: res.itemCount });
      await mutateItems();
    } catch (err: any) {
      setSyncResult({ error: err.message ?? 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-secondary mt-2">Connect ConvFlow to your ERP systems.</p>
        </div>
      </div>

      <div className="glass-panel p-8 max-w-2xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="p-4 bg-accent/10 rounded-xl">
            <Database size={32} color="var(--accent-primary)" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">ERPNext</h2>
            <p className="text-sm text-secondary">Automatically push leads and create draft sales orders.</p>
          </div>
        </div>

        {statusLoading ? (
          <div className="py-8 text-center text-secondary">Checking status...</div>
        ) : statusError ? (
          <div className="py-8 text-center text-danger text-sm flex flex-col items-center gap-2">
            <AlertCircle size={20} />
            Failed to load ERPNext status. Check your connection.
          </div>
        ) : isConnected ? (
          <div className="p-6 bg-success/10 border border-success/30 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-success font-semibold">
                <Link2 size={18} />
                Connected to ERPNext
              </div>
              <button 
                className="btn btn-danger text-xs px-3 py-1.5" 
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
            </div>
            <p className="text-sm text-secondary mb-6">
              Your bot is actively syncing items and pushing leads.
            </p>
            
            <div className="pt-5 border-t border-success/20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Item Catalog Sync</span>
                <button 
                  onClick={handleSync} 
                  disabled={syncing}
                  className="btn btn-secondary px-3 py-1.5 text-xs flex items-center gap-2 bg-success/20 hover:bg-success/30 border-success/30 text-success font-semibold"
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
              
              {syncResult?.count !== undefined && (
                <div className="text-xs text-success">
                  ✅ Successfully synced {syncResult.count} items into cache.
                </div>
              )}
              {syncResult?.error && (
                <div className="text-xs text-danger flex items-center gap-1.5">
                  <AlertCircle size={14} /> {syncResult.error}
                </div>
              )}
            </div>

            {/* Synced item catalog preview */}
            {items.length > 0 && (
              <div className="mt-5 pt-5 border-t border-success/20">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Cached Catalog</span>
                  <span className="text-xs text-muted">{items.length} items</span>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
                  {items.slice(0, 100).map(it => (
                    <div key={it.itemCode} className="flex items-center justify-between px-3 py-2 text-xs">
                      <span className="text-secondary truncate mr-3">{it.itemName}</span>
                      <span className="text-white font-mono flex-shrink-0">
                        {it.currency} {Number(it.standardRate).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                {items.length > 100 && (
                  <div className="text-[10px] text-muted mt-2">Showing first 100 of {items.length}.</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleConnect} className="flex flex-col gap-6">
            {connectError && (
              <div className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {connectError}
              </div>
            )}
            
            <div>
              <label className="label">ERPNext URL</label>
              <input type="url" className="input" value={erpnextUrl} onChange={e => setErpnextUrl(e.target.value)} placeholder="https://erp.yourcompany.com" required disabled={connecting} />
            </div>
            <div>
              <label className="label">API Key</label>
              <input type="text" className="input" value={apiKey} onChange={e => setApiKey(e.target.value)} required disabled={connecting} />
            </div>
            <div>
              <label className="label">API Secret</label>
              <input type="password" className="input" value={apiSecret} onChange={e => setApiSecret(e.target.value)} required disabled={connecting} />
            </div>
            <div className="border-t border-white/10 pt-6 mt-2">
              <button type="submit" className="btn btn-primary flex items-center gap-2" disabled={connecting}>
                {connecting && <Loader2 size={16} className="animate-spin" />}
                {connecting ? 'Connecting...' : 'Connect ERPNext'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
