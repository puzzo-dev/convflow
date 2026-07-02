'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Bot, User, Search, RefreshCw, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  message: string;
  createdAt: string;
}

export default function ConversationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState('');

  // Get list of phones
  const { data: phonesData } = useSWR(`/platform/bots/${slug}/conversations`, fetcher, { refreshInterval: 10_000 });
  const phones: string[] = phonesData?.phones ?? [];
  const filteredPhones = phones.filter(p => p.includes(search));

  // Get thread for selected phone
  const { data: threadData, mutate: mutateThread } = useSWR(
    selectedPhone ? `/platform/bots/${slug}/conversations/${selectedPhone}` : null,
    fetcher,
    { refreshInterval: 5_000 }
  );
  const thread: Message[] = threadData?.thread ?? [];
  const humanMode: boolean = threadData?.humanMode ?? false;

  const handleResume = async () => {
    if (!selectedPhone) return;
    setResuming(true);
    setResumeError('');
    try {
      await apiFetch(`/platform/bots/${slug}/conversations/${selectedPhone}/resume`, { method: 'POST' });
      await mutateThread();
    } catch (err: any) {
      setResumeError(err?.message ?? 'Failed to resume. You may not have permission.');
    } finally {
      setResuming(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-3xl font-bold">Conversations</h1>
          <p className="text-secondary mt-2">Full interaction history per WhatsApp number.</p>
        </div>
      </div>

      <div className="flex gap-5 h-[calc(100vh-240px)] min-h-[500px]">
        {/* Phone List */}
        <div className="glass-panel w-72 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-white/10">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                className="input pl-8 text-sm py-2"
                placeholder="Search phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredPhones.length === 0 ? (
              <div className="p-6 text-center text-muted text-sm">No conversations yet</div>
            ) : (
              filteredPhones.map(phone => (
                <button
                  key={phone}
                  onClick={() => setSelectedPhone(phone)}
                  className={`w-full text-left px-4 py-3.5 border-b border-white/5 transition-colors ${
                    selectedPhone === phone ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-white/3'
                  }`}
                >
                  <div className="font-medium text-sm">+{phone}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread View */}
        <div className="glass-panel flex-1 flex flex-col min-w-0">
          {!selectedPhone ? (
            <div className="flex-1 flex items-center justify-center text-muted text-sm">
              Select a conversation from the left
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-5 py-3.5 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                <div>
                  <div className="font-semibold">+{selectedPhone}</div>
                  {humanMode && (
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-danger">
                      <AlertCircle size={12} />
                      🔴 Awaiting Agent — Bot is paused
                    </div>
                  )}
                  {resumeError && (
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-danger">
                      <AlertCircle size={12} /> {resumeError}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {humanMode && (
                    <button
                      onClick={handleResume}
                      disabled={resuming}
                      className="btn btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5"
                    >
                      <RefreshCw size={13} className={resuming ? 'animate-spin' : ''} />
                      {resuming ? 'Resuming...' : 'Resume Bot'}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {thread.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted text-sm">
                    No messages yet
                  </div>
                ) : (
                  thread.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-[72%] ${
                        msg.direction === 'inbound' ? 'self-start' : 'self-end flex-row-reverse'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.direction === 'inbound'
                            ? 'bg-accent-secondary/20 text-accent-secondary'
                            : 'bg-accent/20 text-accent'
                        }`}
                      >
                        {msg.direction === 'inbound' ? <User size={14} /> : <Bot size={14} />}
                      </div>
                      <div>
                        <div
                          className={`px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                            msg.direction === 'inbound'
                              ? 'bg-white/8 border border-white/10 rounded-2xl rounded-tl-none'
                              : 'bg-accent/80 rounded-2xl rounded-tr-none'
                          }`}
                        >
                          {msg.message}
                        </div>
                        <div className={`text-[10px] text-muted mt-1.5 ${msg.direction === 'outbound' ? 'text-right' : ''}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
