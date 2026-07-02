'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Loader2, CheckCircle2, RefreshCw, Wifi } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

export default function ConnectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [reconnecting, setReconnecting] = useState(false);
  const [actionError, setActionError]   = useState('');

  const { data, isLoading, mutate } = useSWR(
    `/platform/bots/${slug}/qr`,
    fetcher,
    {
      refreshInterval: 2000, // poll every 2s as per SKILL.md
      refreshWhenHidden: false,
    }
  );

  const status: string   = data?.status ?? 'STARTING';
  const qrImage: string  = data?.qrImage ?? null;
  const phoneNum: string = data?.phone ?? null;

  const isConnected = status === 'CONNECTED';
  const isScanQR    = status === 'SCAN_QR' || (status !== 'CONNECTED' && qrImage);

  const handleReconnect = async () => {
    setReconnecting(true);
    setActionError('');
    try {
      await apiFetch(`/platform/bots/${slug}/reconnect`, { method: 'POST' });
      mutate();
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to reconnect. You may not have permission.');
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Connect WhatsApp</h1>
          <p className="text-secondary mt-2">Link your WhatsApp number to this bot session.</p>
        </div>
        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          className="btn btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={16} className={reconnecting ? 'animate-spin' : ''} />
          {reconnecting ? 'Restarting...' : 'Reconnect'}
        </button>
      </div>

      {actionError && (
        <div className="mb-6 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm max-w-2xl mx-auto text-center">
          {actionError}
        </div>
      )}

      <div className="glass-panel p-12 max-w-2xl mx-auto text-center">

        {/* CONNECTED State */}
        {isConnected && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-success/15 flex items-center justify-center border-2 border-success">
              <CheckCircle2 size={48} className="text-success" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-success mb-2">Bot is Live! 🎉</h2>
              <p className="text-secondary">
                Your WhatsApp number <span className="text-white font-semibold">+{phoneNum}</span> is connected and ready.
              </p>
            </div>
            <div className="flex items-center gap-2 px-5 py-2.5 bg-success/10 border border-success/30 rounded-full text-success text-sm font-medium">
              <Wifi size={16} />
              Session Active
            </div>
          </div>
        )}

        {/* SCAN_QR State */}
        {isScanQR && (
          <>
            <h2 className="text-xl font-semibold mb-2">Scan with WhatsApp</h2>
            <ol className="text-left inline-block mb-8 text-secondary text-sm leading-relaxed list-none">
              <li className="mb-1">1. Open WhatsApp on your phone</li>
              <li className="mb-1">2. Tap <strong>Linked Devices → Link a Device</strong></li>
              <li>3. Point your camera at the QR code below</li>
            </ol>

            <div className="w-[280px] h-[280px] mx-auto bg-white p-3 rounded-xl flex items-center justify-center border-4 border-accent mb-6">
              {qrImage ? (
                <img
                  src={
                    qrImage.startsWith('data:') || qrImage.startsWith('http://') || qrImage.startsWith('https://')
                      ? qrImage
                      : `data:image/png;base64,${qrImage}`
                  }
                  alt="WhatsApp QR Code"
                  className="w-full h-full object-contain"
                />
              ) : (
                <Loader2 size={40} className="animate-spin text-accent" />
              )}
            </div>
            <p className="text-xs text-muted">QR refreshes every 2 seconds. Waiting for scan...</p>
          </>
        )}

        {/* STARTING State */}
        {!isConnected && !isScanQR && (
          <div className="flex flex-col items-center gap-5 py-8">
            <Loader2 size={48} className="animate-spin text-accent" />
            <div>
              <h2 className="text-xl font-semibold mb-2">Starting Session...</h2>
              <p className="text-secondary text-sm">Initialising WhatsApp session. This may take a moment.</p>
            </div>
            {isLoading && <div className="text-xs text-muted">Connecting to OpenWA...</div>}
          </div>
        )}

      </div>
    </>
  );
}
