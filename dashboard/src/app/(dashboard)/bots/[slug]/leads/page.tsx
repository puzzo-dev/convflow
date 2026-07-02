'use client';
import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type CellContext,
  type Header,
  type HeaderGroup,
  type ColumnDef,
} from '@tanstack/react-table';
import { Download, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Lead {
  id: string;
  phone: string;
  name: string | null;
  answers: Record<string, string>;
  leadScore: number;
  classification: string;
  source: string;
  createdAt: string;
}

interface Pagination { page: number; limit: number; total: number; totalPages: number; }

const fetcher = (url: string) => apiFetch(url);
const PAGE_SIZE = 50;

const classificationColors: Record<string, string> = {
  hot: 'bg-danger/20 text-danger',
  warm: 'bg-warning/20 text-warning',
  nurture: 'bg-accent/20 text-accent',
  cold: 'bg-white/10 text-muted',
  order: 'bg-success/20 text-success',
};

const columnHelper = createColumnHelper<Lead>();

export default function LeadsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);          // 1-based, server page
  const [exporting, setExporting] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Reset to page 1 whenever the classification filter changes.
  const filterQS = filter ? `classification=${filter}&` : '';
  const { data, isLoading } = useSWR(
    `/platform/bots/${slug}/leads?${filterQS}page=${page}&limit=${PAGE_SIZE}`,
    fetcher,
    { refreshInterval: 30_000 },
  );

  const leads: Lead[] = data?.leads ?? [];
  const pagination: Pagination = data?.pagination ?? { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 };

  const onFilterChange = (v: string) => { setFilter(v); setPage(1); };

  const columns = useMemo<ColumnDef<Lead, any>[]>(() => [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (info: CellContext<Lead, string | null>) => <span className="font-medium">{info.getValue() ?? '—'}</span>,
    }),
    columnHelper.accessor('phone', {
      header: 'Phone',
      cell: (info: CellContext<Lead, string>) => <span className="text-secondary">+{info.getValue()}</span>,
    }),
    columnHelper.accessor('classification', {
      header: 'Classification',
      cell: (info: CellContext<Lead, string>) => (
        <span className={`badge ${classificationColors[info.getValue()] ?? ''}`}>{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('leadScore', {
      header: 'Score',
      cell: (info: CellContext<Lead, number>) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min((info.getValue() / 12) * 100, 100)}%` }} />
          </div>
          <span className="text-secondary text-xs">{info.getValue()}</span>
        </div>
      ),
    }),
    columnHelper.accessor('source', {
      header: 'Source',
      cell: (info: CellContext<Lead, string>) => <span className="text-secondary text-xs">{info.getValue() ?? 'direct'}</span>,
    }),
    columnHelper.accessor('createdAt', {
      header: 'Date',
      cell: (info: CellContext<Lead, string>) => (
        <span className="text-secondary text-xs">
          {new Date(info.getValue()).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Action',
      cell: ({ row }: CellContext<Lead, unknown>) => (
        <button
          className="btn btn-secondary px-3 py-1 text-xs"
          onClick={() => setSelectedLead(row.original)}
        >
          View Details
        </button>
      ),
    }),
  ], []);

  // Client-side search filters within the current server page only.
  const visibleLeads = leads.filter(l =>
    search === '' ||
    l.name?.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search),
  );

  const table = useReactTable<Lead>({
    data: visibleLeads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Export walks EVERY server page so we never silently truncate.
  const handleExport = async () => {
    if (pagination.total === 0 || exporting) return;
    setExporting(true);
    try {
      const all: Lead[] = [];
      const totalPages = Math.max(1, pagination.totalPages);
      for (let p = 1; p <= totalPages; p++) {
        const res = await apiFetch(`/platform/bots/${slug}/leads?${filterQS}page=${p}&limit=${PAGE_SIZE}`);
        all.push(...(res.leads ?? []));
      }
      const rows = all.map(l => ({
        name: l.name ?? '', phone: l.phone, score: l.leadScore,
        classification: l.classification, date: l.createdAt, ...l.answers,
      }));
      const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeSlug = slug
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 50);
      a.download = `${safeSlug || 'bot'}-leads.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Lead CRM</h1>
          <p className="text-secondary mt-2">
            {isLoading ? 'Loading...' : `${pagination.total} leads captured by your bot`}
          </p>
        </div>
        <div className="flex gap-3">
          <select className="input w-44 text-sm" value={filter} onChange={e => onFilterChange(e.target.value)}>
            <option value="">All Classifications</option>
            <option value="hot">🔥 Hot</option>
            <option value="warm">🌡️ Warm</option>
            <option value="nurture">🌱 Nurture</option>
            <option value="cold">❄️ Cold</option>
            <option value="order">🛒 Orders</option>
          </select>
          <button onClick={handleExport} disabled={exporting} className="btn btn-primary flex items-center gap-2">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        {/* Search (current page) */}
        <div className="p-4 border-b border-white/10">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              className="input pl-9 text-sm py-2"
              placeholder="Search this page by name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg: HeaderGroup<Lead>) => (
                <tr key={hg.id}>
                  {hg.headers.map((header: Header<Lead, unknown>) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10 cursor-pointer select-none hover:text-primary transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <ChevronUp size={12} />}
                        {header.column.getIsSorted() === 'desc' && <ChevronDown size={12} />}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center text-muted text-sm">Loading leads...</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-16 text-center text-muted text-sm">
                  No leads yet. Your bot will capture them as customers interact.
                </td></tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-5 py-3.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10">
          <div className="text-xs text-muted">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="btn btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Lead detail modal */}
      {selectedLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedLead(null)}
        >
          <div className="glass-panel w-full max-w-lg p-8 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setSelectedLead(null)}
              className="absolute top-4 right-4 text-muted hover:text-primary transition-colors"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold mb-1">{selectedLead.name ?? 'Unnamed lead'}</h2>
            <div className="text-secondary text-sm mb-6">+{selectedLead.phone}</div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <div className="text-xs text-muted mb-1">Classification</div>
                <span className={`badge ${classificationColors[selectedLead.classification] ?? ''}`}>
                  {selectedLead.classification}
                </span>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Lead Score</div>
                <div className="text-sm font-medium">{selectedLead.leadScore} / 12</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Source</div>
                <div className="text-sm">{selectedLead.source ?? 'direct'}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Captured</div>
                <div className="text-sm">{new Date(selectedLead.createdAt).toLocaleString('en-NG')}</div>
              </div>
            </div>

            <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Answers</div>
            <div className="rounded-lg border border-white/10 divide-y divide-white/5 max-h-64 overflow-y-auto">
              {Object.keys(selectedLead.answers ?? {}).length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted">No answers recorded.</div>
              ) : (
                Object.entries(selectedLead.answers).map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                    <span className="text-muted">{k}</span>
                    <span className="text-white text-right break-words">{String(v)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
