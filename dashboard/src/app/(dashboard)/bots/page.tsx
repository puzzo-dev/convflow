'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Bot, Plus, Wifi, WifiOff, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

interface BotItem {
  slug: string;
  name: string;
  openwaSessionId: string;
  active: boolean;
  createdAt: string;
}

export default function BotsPage() {
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', websiteUrl: '', ownerPhone: '' });
  const [error, setError] = useState('');

  const { data, isLoading, mutate } = useSWR('/platform/bots', fetcher);
  const bots: BotItem[] = data?.bots ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await apiFetch('/platform/bots', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      await mutate();
      setShowModal(false);
      setForm({ name: '', websiteUrl: '', ownerPhone: '' });
    } catch (err: any) {
      setError(err.message ?? 'Failed to create bot');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Bots</h1>
          <p className="text-secondary mt-2">Manage all your WhatsApp bot instances.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary flex items-center gap-2">
          <Plus size={17} />
          Create New Bot
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={32} className="animate-spin text-accent" />
        </div>
      ) : bots.length === 0 ? (
        <div className="glass-panel p-16 text-center">
          <Bot size={48} className="text-muted mx-auto mb-5" />
          <h2 className="text-xl font-semibold mb-2">No bots yet</h2>
          <p className="text-secondary mb-6 text-sm">Create your first bot to get started</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus size={16} /> Create Bot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {bots.map(bot => (
            <div key={bot.slug} className="glass-panel p-6 flex flex-col gap-4 hover:border-accent/30 transition-all">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                  <Bot size={22} className="text-accent" />
                </div>
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                  bot.active ? 'bg-success/15 text-success' : 'bg-white/10 text-muted'
                }`}>
                  {bot.active ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {bot.active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div>
                <h3 className="font-semibold text-lg">{bot.name}</h3>
                <div className="text-xs text-muted mt-1">Session: {bot.openwaSessionId}</div>
              </div>

              <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
                <Link href={`/bots/${bot.slug}/flows`} className="btn btn-primary flex-1 text-sm py-2 text-center">
                  Flow Builder
                </Link>
                <Link href={`/bots/${bot.slug}/leads`} className="btn btn-secondary flex-1 text-sm py-2 text-center">
                  Leads
                </Link>
                <Link href={`/bots/${bot.slug}/connect`} className="btn btn-secondary px-3 py-2 text-sm">
                  QR
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Bot Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-8 relative">
            <button
              onClick={() => { setShowModal(false); setError(''); }}
              className="absolute top-4 right-4 text-muted hover:text-primary transition-colors"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold mb-1">Create New Bot</h2>
            <p className="text-secondary text-sm mb-6">Your bot will be provisioned and ready to connect via QR code.</p>

            {error && (
              <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              <div>
                <label className="label">Business Name</label>
                <input
                  className="input"
                  placeholder="e.g. IVarse Technologies"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Owner WhatsApp Number</label>
                <input
                  className="input"
                  placeholder="e.g. 2348012345678 (no +)"
                  value={form.ownerPhone}
                  onChange={e => setForm(f => ({ ...f, ownerPhone: e.target.value }))}
                  required
                />
                <div className="text-xs text-muted mt-1.5">Lead alerts will be sent to this number</div>
              </div>
              <div>
                <label className="label">Website URL <span className="text-muted">(optional)</span></label>
                <input
                  className="input"
                  placeholder="https://yoursite.com"
                  value={form.websiteUrl}
                  onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                />
              </div>
              <button type="submit" className="btn btn-primary mt-1" disabled={creating}>
                {creating ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Bot'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
