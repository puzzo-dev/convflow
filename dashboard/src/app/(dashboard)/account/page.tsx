'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';
import { User, Key, Shield, Clock, AlertCircle, RefreshCw, Building2 } from 'lucide-react';

const fetcher = (url: string) => apiFetch(url);

export default function AccountPage() {
  const { data, isLoading, mutate } = useSWR('/platform/account', fetcher);
  const { data: orgData } = useSWR('/platform/org', fetcher);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState('');
  const [newKey, setNewKey] = useState('');

  // Backend returns { user }.
  const account = data?.user;
  const org     = orgData?.org;
  const orgRole = orgData?.role;

  const handleRotateKey = async () => {
    if (!confirm('WARNING: Rotating your API key will instantly break any existing integrations using the old key. Are you sure?')) {
      return;
    }
    setRotating(true);
    setRotateError('');
    setNewKey('');
    try {
      const res = await apiFetch('/platform/account/api-key/rotate', { method: 'POST' });
      setNewKey(res.apiKey);
      await mutate();
    } catch (err: any) {
      setRotateError(err.message ?? 'Failed to rotate API key');
    } finally {
      setRotating(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-secondary">Loading account profile...</div>;
  }

  if (!account) {
    return <div className="p-8 text-danger">Failed to load account.</div>;
  }

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Account Profile</h1>
          <p className="text-secondary mt-2">Your signed-in profile and API credentials.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="glass-panel p-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent/10 rounded-xl">
              <User size={24} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Profile Overview</h2>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Name</label>
              <div className="text-sm font-medium">{account.name}</div>
            </div>
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Email Address</label>
              <div className="text-sm">{account.email}</div>
            </div>
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Platform Role</label>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-white/5 border border-white/10 text-secondary">
                <Shield size={12} /> {account.role === 'super_admin' ? 'Super Admin' : 'Member'}
              </div>
            </div>
            {org && (
              <div>
                <label className="text-xs text-muted font-medium mb-1 block">Organization</label>
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={14} className="text-muted" />
                  <span className="font-medium">{org.name}</span>
                  {orgRole && <span className="badge bg-accent/15 text-accent text-[10px]">{orgRole}</span>}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted font-medium mb-1 block">Member Since</label>
              <div className="flex items-center gap-1.5 text-sm text-secondary">
                <Clock size={14} />
                {new Date(account.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>
        </div>

        {/* Security & API Key Card */}
        <div className="glass-panel p-6 flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-warning/10 rounded-xl">
              <Key size={24} className="text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">API Access</h2>
              <p className="text-xs text-secondary mt-1">Manage your platform API key for external integrations.</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <div className="p-4 bg-white/5 border border-white/10 rounded-lg">
              <label className="text-xs text-muted font-medium mb-2 block">API Key</label>
              <div className="font-mono text-sm break-all text-white/90 select-all">
                {newKey || <span className="text-muted italic">Hidden — rotate to reveal a new key</span>}
              </div>
              <div className="text-[10px] text-muted mt-2">
                For security, your API key is shown only once, immediately after you generate it.
                Store it somewhere safe. Use it in the `X-API-Key` header when calling the platform API.
              </div>
            </div>

            {rotateError && (
              <div className="px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {rotateError}
              </div>
            )}

            <div className="mt-auto pt-4">
              <button 
                onClick={handleRotateKey}
                disabled={rotating}
                className="btn btn-secondary w-full flex items-center justify-center gap-2 border-warning/30 text-warning hover:bg-warning/10"
              >
                <RefreshCw size={16} className={rotating ? 'animate-spin' : ''} />
                {rotating ? 'Generating New Key...' : 'Rotate API Key'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
