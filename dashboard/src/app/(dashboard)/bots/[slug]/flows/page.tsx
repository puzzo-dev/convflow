'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Save, Play, Plus, X, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

// ─── Custom Node Components ───────────────────────────────────────────────────

function NodeWrapper({ label, color, selected, children }: {
  label: string; color: string; selected?: boolean; children: React.ReactNode;
}) {
  return (
    <div
      className="min-w-[220px] rounded-xl border-2 bg-surface transition-all cursor-pointer"
      style={{ borderColor: selected ? '#fff' : color, boxShadow: selected ? `0 0 0 2px ${color}55` : undefined }}
    >
      <div className="px-3 py-2 rounded-t-xl font-semibold text-xs" style={{ background: `${color}22`, color }}>
        {label}
      </div>
      <div className="p-3 text-xs text-secondary flex flex-col gap-2">{children}</div>
    </div>
  );
}

function SelectNode({ data, selected }: NodeProps) {
  const d = data as any;
  const options: any[] = d.options ?? [];
  const actionCount = (d.actions ?? []).length;
  return (
    <NodeWrapper label="Select (routes per option)" color="#e2603f" selected={selected}>
      <Handle type="target" position={Position.Top} style={{ background: '#e2603f' }} />
      <div className="text-white truncate">{d.message || <span className="italic text-muted">Click to edit…</span>}</div>
      <div className="text-muted text-[10px]">key: {d.answerKey || '—'}{actionCount ? ` · ${actionCount} action${actionCount > 1 ? 's' : ''}` : ''}</div>

      {options.length > 0 ? (
        <div className="flex flex-col gap-1 mt-1">
          {options.map((o, i) => (
            <div key={i} className="relative flex items-center rounded bg-white/[0.06] px-2 py-1 text-[10px]">
              <span className="text-secondary truncate">{o.value}. {o.label || '—'}</span>
              {/* one source handle per option — drag it to the node that handles this choice */}
              <Handle
                type="source"
                id={String(o.value)}
                position={Position.Right}
                style={{ background: '#e2603f', top: '50%', right: -7 }}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle type="source" position={Position.Bottom} style={{ background: '#e2603f' }} />
      )}
    </NodeWrapper>
  );
}

function FreeTextNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeWrapper label="Free Text" color="#c9a27a" selected={selected}>
      <Handle type="target" position={Position.Top}    style={{ background: '#c9a27a' }} />
      <div className="text-white truncate">{d.message || <span className="italic text-muted">Click to edit…</span>}</div>
      <div className="text-muted text-[10px]">
        key: {d.answerKey || '—'}{(d.actions ?? []).length ? ` · ${(d.actions ?? []).length} action${(d.actions ?? []).length > 1 ? 's' : ''}` : ''}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#c9a27a' }} />
    </NodeWrapper>
  );
}

function BranchNode({ data, selected }: NodeProps) {
  const d = data as any;
  return (
    <NodeWrapper label="Branch (Conditional)" color="#fbbf24" selected={selected}>
      <Handle type="target" position={Position.Top}    style={{ background: '#fbbf24' }} />
      <div className="text-white truncate">{d.message || <span className="italic text-muted">Click to edit…</span>}</div>
      <div className="text-muted text-[10px]">key: {d.answerKey || '—'} · {Object.keys(d.branches ?? {}).length} branches</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#fbbf24' }} />
    </NodeWrapper>
  );
}

function TerminalNode({ data, selected }: NodeProps) {
  const d = data as any;
  const colors: Record<string, string> = {
    save_lead: '#f87171', create_order: '#e2603f', notify_only: '#c9a27a',
    send_info: '#a1a1aa', book_appointment: '#fbbf24', webhook: '#4ade80',
  };
  const color = colors[d.terminalType ?? 'save_lead'] ?? '#f87171';
  return (
    <NodeWrapper label={`Terminal · ${d.terminalType ?? 'save_lead'}`} color={color} selected={selected}>
      <Handle type="target" position={Position.Top} style={{ background: color }} />
      <div className="text-white truncate">{d.successMessage || <span className="italic text-muted">Click to edit…</span>}</div>
      <div className="text-muted text-[10px]">Flow ends here · fires action</div>
    </NodeWrapper>
  );
}

const NODE_TYPES = {
  selectNode:   SelectNode,
  freeTextNode: FreeTextNode,
  branchNode:   BranchNode,
  terminalNode: TerminalNode,
};

// ─── Deletable Edge ───────────────────────────────────────────────────────────
// Renders the connection plus a small × button at its midpoint. The button is
// muted until you hover the edge, then turns red — click to remove the link.

function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, selected,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: selected ? '#fafafa' : '#e2603f', strokeWidth: selected ? 2.5 : 1.5 }}
      />
      <EdgeLabelRenderer>
        <button
          className="nodrag nopan group flex items-center justify-center rounded-full transition-all"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            width: 20,
            height: 20,
            background: '#141414',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
          title="Delete connection"
          onClick={(e) => {
            e.stopPropagation();
            setEdges((eds) => eds.filter((ed) => ed.id !== id));
          }}
        >
          <X size={12} className="text-muted group-hover:text-danger transition-colors" />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const EDGE_TYPES = { deletable: DeletableEdge };
const EDGE_STYLE = { stroke: '#e2603f' };

// ─── Node Editor Panel ────────────────────────────────────────────────────────

const TERMINAL_TYPES = ['save_lead', 'create_order', 'notify_only', 'send_info', 'book_appointment', 'webhook'];

function NodeEditorPanel({ node, slug, onChange, onDelete, onClose }: {
  node: Node;
  slug: string;
  onChange: (id: string, patch: Record<string, any>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const d   = node.data as any;
  const set = (patch: Record<string, any>) => onChange(node.id, patch);

  const setOption = (idx: number, field: 'label' | 'value', val: string) => {
    const opts = [...(d.options ?? [])];
    opts[idx] = { ...opts[idx], [field]: val };
    set({ options: opts });
  };
  const addOption    = () => set({ options: [...(d.options ?? []), { label: '', value: String((d.options?.length ?? 0) + 1) }] });
  const removeOption = (idx: number) => set({ options: (d.options ?? []).filter((_: any, i: number) => i !== idx) });

  const setBranch = (oldKey: string, newKey: string, val: number) => {
    const b: Record<string, number> = { ...(d.branches ?? {}) };
    if (oldKey !== newKey) delete b[oldKey];
    b[newKey] = val;
    set({ branches: b });
  };
  const addBranch    = () => set({ branches: { ...(d.branches ?? {}), '': 0 } });
  const removeBranch = (key: string) => {
    const b = { ...(d.branches ?? {}) };
    delete b[key];
    set({ branches: b });
  };

  const typeLabel: Record<string, string> = {
    selectNode: 'Select (Multiple Choice)', freeTextNode: 'Free Text',
    branchNode: 'Branch', terminalNode: 'Terminal',
  };

  return (
    <div className="w-[300px] flex-shrink-0 border-l border-white/[0.08] bg-surface flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="text-xs font-semibold text-white">{typeLabel[node.type ?? ''] ?? 'Node'}</span>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors"><X size={15} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

        {node.type !== 'terminalNode' && (
          <div>
            <label className="label mb-1.5 block">Message sent to user</label>
            <textarea
              className="input w-full resize-none text-xs"
              rows={4}
              value={d.message ?? ''}
              onChange={e => set({ message: e.target.value })}
              placeholder="What do you want to ask?"
            />
            <p className="text-[10px] text-muted mt-1">Use {'{name}'} for contact name</p>
          </div>
        )}

        {node.type !== 'terminalNode' && (
          <div>
            <label className="label mb-1.5 block">Answer key</label>
            <input
              className="input w-full text-xs"
              value={d.answerKey ?? ''}
              onChange={e => set({ answerKey: e.target.value })}
              placeholder="e.g. budget, service_type"
            />
            <p className="text-[10px] text-muted mt-1">Stored in lead answers under this key</p>
          </div>
        )}

        {node.type === 'selectNode' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Options</label>
              <button onClick={addOption} className="text-accent text-[10px] flex items-center gap-1 hover:opacity-80">
                <Plus size={10} /> Add
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {(d.options ?? []).map((opt: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="input text-xs flex-1 min-w-0"
                    value={opt.label ?? ''}
                    onChange={e => setOption(i, 'label', e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  <input
                    className="input text-xs w-14"
                    value={opt.value ?? ''}
                    onChange={e => setOption(i, 'value', e.target.value)}
                    placeholder="val"
                  />
                  <button onClick={() => removeOption(i)} className="text-danger hover:opacity-80 flex-shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {!(d.options?.length) && <p className="text-[10px] text-muted italic">No options yet</p>}
            </div>
          </div>
        )}

        {node.type === 'branchNode' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Branch rules</label>
              <button onClick={addBranch} className="text-accent text-[10px] flex items-center gap-1 hover:opacity-80">
                <Plus size={10} /> Add
              </button>
            </div>
            <p className="text-[10px] text-muted mb-2">answer value → stage number</p>
            <div className="flex flex-col gap-2">
              {Object.entries(d.branches ?? {}).map(([key, val], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    className="input text-xs w-20"
                    defaultValue={key}
                    onBlur={e => setBranch(key, e.target.value, val as number)}
                    placeholder="answer"
                  />
                  <span className="text-muted text-[10px] flex-shrink-0">→</span>
                  <input
                    className="input text-xs w-16"
                    type="number"
                    min={0}
                    defaultValue={val as number}
                    onBlur={e => setBranch(key, key, Number(e.target.value))}
                    placeholder="0"
                  />
                  <button onClick={() => removeBranch(key)} className="text-danger hover:opacity-80 flex-shrink-0">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {!Object.keys(d.branches ?? {}).length && <p className="text-[10px] text-muted italic">No branches yet</p>}
            </div>
          </div>
        )}

        {node.type === 'terminalNode' && (
          <>
            <div>
              <label className="label mb-1.5 block">Action type</label>
              <select
                className="input w-full text-xs"
                value={d.terminalType ?? 'save_lead'}
                onChange={e => set({ terminalType: e.target.value })}
              >
                {TERMINAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label mb-1.5 block">Success message</label>
              <textarea
                className="input w-full resize-none text-xs"
                rows={3}
                value={d.successMessage ?? ''}
                onChange={e => set({ successMessage: e.target.value })}
                placeholder="Message sent to user after flow completes"
              />
            </div>
          </>
        )}

        {/* Pluggable actions — available on every node type */}
        <div className="pt-2 border-t border-white/10">
          <ActionsEditor
            slug={slug}
            actions={d.actions ?? []}
            onChange={(actions) => set({ actions })}
          />
        </div>
      </div>

      <div className="p-4 border-t border-white/10 flex-shrink-0">
        <button
          onClick={() => onDelete(node.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-danger border border-danger/30 hover:bg-danger/10 transition-colors"
        >
          <Trash2 size={13} /> Delete Node
        </button>
      </div>
    </div>
  );
}

// ─── Actions Editor (an action always lives inside a node) ────────────────────

const ACTION_TYPES = [
  { value: 'http_request', label: 'HTTP Request (GET / POST)' },
  { value: 'notify_owner', label: 'Notify (Email / WhatsApp / SMS)' },
  { value: 'plugin',       label: 'Plugin (connected system)' },
];

function ActionsEditor({ slug, actions, onChange }: {
  slug: string;
  actions: any[];
  onChange: (actions: any[]) => void;
}) {
  const update = (i: number, patch: Record<string, any>) =>
    onChange(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...actions, { type: 'http_request', method: 'POST', url: '', blocking: false }]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label mb-0">Actions</label>
        <button onClick={add} className="text-accent text-[10px] flex items-center gap-1 hover:opacity-80">
          <Plus size={10} /> Add action
        </button>
      </div>
      <p className="text-[10px] text-muted mb-2">
        Fired when this node’s answer is accepted. Non-blocking unless you tick “wait”.
      </p>

      <div className="flex flex-col gap-3">
        {actions.length === 0 && <p className="text-[10px] text-muted italic">No actions on this node.</p>}

        {actions.map((a, i) => (
          <div key={i} className="rounded-lg border border-white/10 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <select
                className="input text-xs flex-1"
                value={a.type}
                onChange={e => update(i, { type: e.target.value })}
              >
                {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => remove(i)} className="text-danger hover:opacity-80 flex-shrink-0">
                <Trash2 size={12} />
              </button>
            </div>

            {a.type === 'http_request' && (
              <>
                <div className="flex gap-2">
                  <select
                    className="input text-xs w-[70px]"
                    value={a.method ?? 'POST'}
                    onChange={e => update(i, { method: e.target.value })}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                  <input
                    className="input text-xs flex-1 min-w-0"
                    placeholder="https://erp.example.com/api/lead"
                    value={a.url ?? ''}
                    onChange={e => update(i, { url: e.target.value })}
                  />
                </div>
                <textarea
                  className="input text-xs resize-none font-mono"
                  rows={2}
                  placeholder={'Headers JSON (optional)\ne.g. {"Authorization":"token k:s"}'}
                  value={a._headersText ?? ''}
                  onChange={e => update(i, { _headersText: e.target.value })}
                />
                <textarea
                  className="input text-xs resize-none font-mono"
                  rows={2}
                  placeholder={'Body JSON (optional). Tokens: {name} {phone} {answers.key}\nBlank → standard lead payload'}
                  value={a._bodyText ?? ''}
                  onChange={e => update(i, { _bodyText: e.target.value })}
                />
                <input
                  className="input text-xs"
                  placeholder="Save response to answer key (optional)"
                  value={a.saveResponseTo ?? ''}
                  onChange={e => update(i, { saveResponseTo: e.target.value })}
                />
                {a.saveResponseTo && (
                  <input
                    className="input text-xs"
                    placeholder="Response JSON path e.g. data.name"
                    value={a.responsePath ?? ''}
                    onChange={e => update(i, { responsePath: e.target.value })}
                  />
                )}
              </>
            )}

            {a.type === 'notify_owner' && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-muted">
                  Sends the lead’s details to the owner via the selected channels
                  (configured under Account → Notifications).
                </p>
                <div className="flex gap-3">
                  {(['whatsapp', 'email', 'sms'] as const).map(ch => {
                    const selected: string[] = a.channels ?? ['whatsapp'];
                    return (
                      <label key={ch} className="flex items-center gap-1.5 text-[10px] text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.includes(ch)}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selected, ch]
                              : selected.filter(c => c !== ch);
                            update(i, { channels: next });
                          }}
                        />
                        {ch}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {a.type === 'plugin' && (
              <PluginActionFields slug={slug} action={a} onChange={patch => update(i, patch)} />
            )}

            <label className="flex items-center gap-2 text-[10px] text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={!!a.blocking}
                onChange={e => update(i, { blocking: e.target.checked })}
              />
              Wait for this to finish before the next message
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Config → builder shape: expose headers/body objects as editable JSON text.
function hydrateActions(saved: any[]): any[] {
  return saved.map(a => {
    if (a.type !== 'http_request') return { ...a };
    return {
      ...a,
      _headersText: a.headers ? JSON.stringify(a.headers, null, 0) : '',
      _bodyText:    a.body    ? JSON.stringify(a.body, null, 0)    : '',
    };
  });
}

// Builder shape → clean NodeAction[] for the API. Parses the JSON text fields;
// silently drops malformed JSON so a typo can't corrupt the saved config.
function serializeActions(actions: any[]): any[] {
  const parseObj = (txt: string | undefined): Record<string, string> | undefined => {
    if (!txt || !txt.trim()) return undefined;
    try {
      const o = JSON.parse(txt);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : undefined;
    } catch { return undefined; }
  };
  return (actions ?? [])
    .filter(a => a && a.type)
    .map((a): Record<string, any> => {
      if (a.type === 'notify_owner') {
        const channels = Array.isArray(a.channels) && a.channels.length ? a.channels : ['whatsapp'];
        return { type: 'notify_owner', channels, ...(a.blocking ? { blocking: true } : {}) };
      }
      if (a.type === 'plugin') {
        return {
          type: 'plugin',
          pluginId: a.pluginId ?? '',
          actionId: a.actionId ?? '',
          inputs: a.inputs ?? {},
          ...(a.saveResponseTo ? { saveResponseTo: a.saveResponseTo } : {}),
          ...(a.saveResponseTo && a.responsePath ? { responsePath: a.responsePath } : {}),
          ...(a.blocking ? { blocking: true } : {}),
        };
      }
      // http_request
      const headers = parseObj(a._headersText);
      const body    = parseObj(a._bodyText);
      return {
        type: 'http_request',
        method: a.method === 'GET' ? 'GET' : 'POST',
        url: a.url ?? '',
        ...(headers ? { headers } : {}),
        ...(body ? { body } : {}),
        ...(a.saveResponseTo ? { saveResponseTo: a.saveResponseTo } : {}),
        ...(a.saveResponseTo && a.responsePath ? { responsePath: a.responsePath } : {}),
        ...(a.blocking ? { blocking: true } : {}),
      };
    })
    .filter(a => {
      if (a.type === 'http_request') return !!a.url;                 // drop empty-URL http actions
      if (a.type === 'plugin')       return !!a.pluginId && !!a.actionId; // drop incomplete plugin actions
      return true;
    });
}

// ─── Plugin action fields (plugin → action → inputs, live per-tenant options) ─

function PluginActionFields({ slug, action, onChange }: {
  slug: string;
  action: any;
  onChange: (patch: Record<string, any>) => void;
}) {
  const { data: pluginsData } = useSWR('/platform/plugins', fetcher);
  const plugins: any[] = pluginsData?.plugins ?? [];
  const plugin    = plugins.find(p => p.id === action.pluginId);
  const actionDef = plugin?.actions.find((a: any) => a.id === action.actionId);

  const setInput = (key: string, val: any) =>
    onChange({ inputs: { ...(action.inputs ?? {}), [key]: val } });

  return (
    <div className="flex flex-col gap-2">
      <select
        className="input text-xs"
        value={action.pluginId ?? ''}
        onChange={e => onChange({ pluginId: e.target.value, actionId: '', inputs: {} })}
      >
        <option value="">Select plugin…</option>
        {plugins.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      {plugin && (
        <select
          className="input text-xs"
          value={action.actionId ?? ''}
          onChange={e => onChange({ actionId: e.target.value, inputs: {} })}
        >
          <option value="">Select action…</option>
          {plugin.actions.map((a: any) => <option key={a.id} value={a.id}>{a.label} ({a.verb})</option>)}
        </select>
      )}

      {actionDef?.inputs.map((inp: any) => (
        <PluginInputField
          key={inp.key}
          slug={slug}
          pluginId={action.pluginId}
          input={inp}
          value={action.inputs?.[inp.key]}
          onChange={(val: any) => setInput(inp.key, val)}
        />
      ))}

      {actionDef && (
        <>
          <input
            className="input text-xs"
            placeholder="Save response to answer key (optional)"
            value={action.saveResponseTo ?? ''}
            onChange={e => onChange({ saveResponseTo: e.target.value })}
          />
          {action.saveResponseTo && (
            <input
              className="input text-xs"
              placeholder="Response JSON path e.g. data.name"
              value={action.responsePath ?? ''}
              onChange={e => onChange({ responsePath: e.target.value })}
            />
          )}
        </>
      )}
    </div>
  );
}

function PluginInputField({ slug, pluginId, input, value, onChange }: {
  slug: string;
  pluginId: string;
  input: any;
  value: any;
  onChange: (val: any) => void;
}) {
  if (input.type === 'doctype') {
    return (
      <DoctypeSelect
        slug={slug} pluginId={pluginId} optionKey={input.optionsFrom}
        label={input.label} value={value} onChange={onChange}
      />
    );
  }
  if (input.type === 'fieldmap') {
    return <FieldMapEditor label={input.label} help={input.help} value={value ?? {}} onChange={onChange} />;
  }
  // text
  return (
    <div>
      <label className="label text-[10px] mb-1 block">{input.label}</label>
      <input
        className="input text-xs"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={input.help}
      />
    </div>
  );
}

function DoctypeSelect({ slug, pluginId, optionKey, label, value, onChange }: {
  slug: string; pluginId: string; optionKey: string;
  label: string; value: any; onChange: (v: string) => void;
}) {
  const { data, error, isLoading } = useSWR(
    pluginId && optionKey ? `/platform/bots/${slug}/plugins/${pluginId}/options/${optionKey}` : null,
    fetcher,
  );
  const options: { label: string; value: string }[] = data?.options ?? [];

  return (
    <div>
      <label className="label text-[10px] mb-1 block">{label}</label>
      {error ? (
        <p className="text-[10px] text-danger">
          Couldn’t load — connect this system for the bot (Integrations) first, then reopen.
        </p>
      ) : (
        <select className="input text-xs" value={value ?? ''} onChange={e => onChange(e.target.value)}>
          <option value="">{isLoading ? 'Loading…' : 'Select…'}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}

function FieldMapEditor({ label, help, value, onChange }: {
  label: string; help?: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void;
}) {
  const entries = Object.entries(value ?? {});
  const rebuild = (rows: [string, string][]) =>
    onChange(Object.fromEntries(rows.filter(([k]) => k.trim())));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label text-[10px] mb-0">{label}</label>
        <button
          onClick={() => onChange({ ...(value ?? {}), '': '' })}
          className="text-accent text-[10px] flex items-center gap-1 hover:opacity-80"
        >
          <Plus size={10} /> Field
        </button>
      </div>
      {help && <p className="text-[10px] text-muted mb-1.5">{help}</p>}
      <div className="flex flex-col gap-1.5">
        {entries.length === 0 && <p className="text-[10px] text-muted italic">No fields mapped.</p>}
        {entries.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              className="input text-xs w-[38%]"
              defaultValue={k}
              placeholder="erpnext_field"
              onBlur={e => {
                const rows = entries.map((r, idx) => idx === i ? [e.target.value, r[1]] as [string, string] : r);
                rebuild(rows);
              }}
            />
            <span className="text-muted text-[10px]">←</span>
            <input
              className="input text-xs flex-1 min-w-0"
              defaultValue={v}
              placeholder="{answers.name}"
              onBlur={e => {
                const rows = entries.map((r, idx) => idx === i ? [r[0], e.target.value] as [string, string] : r);
                rebuild(rows);
              }}
            />
            <button
              onClick={() => rebuild(entries.filter((_, idx) => idx !== i))}
              className="text-danger hover:opacity-80 flex-shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Canvas (needs ReactFlowProvider above) ───────────────────────────────────

function FlowCanvas({ slug }: { slug: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode]  = useState<Node | null>(null);
  const [saving,     setSaving]          = useState(false);
  const [testing,    setTesting]         = useState(false);
  const [saveStatus, setSaveStatus]      = useState<'idle' | 'ok' | 'error'>('idle');

  const { data: serverData } = useSWR(`/platform/bots/${slug}/flows`, fetcher);

  useEffect(() => {
    if (!serverData?.flows?.length) return;
    const flows = serverData.flows;
    const lastIdx = flows.length - 1;

    setNodes(flows.map((f: any, i: number) => {
      let type = 'freeTextNode';
      if (f.terminal)               type = 'terminalNode';
      else if (f.type === 'select') type = 'selectNode';
      else if (f.type === 'branch') type = 'branchNode';
      return {
        id: String(f.stage), type,
        position: { x: 260, y: 80 + i * 160 },
        data: {
          message:        f.message ?? '',
          answerKey:      f.answerKey ?? '',
          options:        f.options ?? [],
          branches:       f.branches ?? {},
          terminalType:   f.terminal?.type ?? '',
          successMessage: f.terminal?.successMessage ?? '',
          actions:        hydrateActions(f.actions ?? []),
        },
      };
    }));

    // Rebuild edges: select nodes with a branch map get one edge per option
    // (carrying the option value as sourceHandle); everything else links linearly.
    const newEdges: Edge[] = [];
    flows.forEach((f: any, i: number) => {
      const branches = f.branches ?? {};
      if (f.type === 'select' && Object.keys(branches).length) {
        for (const [value, targetIdx] of Object.entries(branches)) {
          newEdges.push({
            id: `e${i}-${value}-${targetIdx}`,
            source: String(f.stage), sourceHandle: String(value),
            target: String(targetIdx),
            type: 'deletable', animated: true, style: EDGE_STYLE,
          });
        }
      } else if (i < lastIdx) {
        newEdges.push({
          id: `e${i}-${i + 1}`, source: String(i), target: String(i + 1),
          type: 'deletable', animated: true, style: EDGE_STYLE,
        });
      }
    });
    setEdges(newEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverData]);

  const onConnect = useCallback(
    (c: Connection) => setEdges(eds => addEdge({ ...c, type: 'deletable', animated: true, style: EDGE_STYLE }, eds)),
    [setEdges],
  );

  // Drag an existing edge endpoint onto another node to re-route it, or drop it
  // on empty canvas to delete it — the fast way to slot a new node between two.
  const reconnectSucceeded = useRef(true);
  const onReconnectStart = useCallback(() => { reconnectSucceeded.current = false; }, []);
  const onReconnect = useCallback((oldEdge: Edge, newConn: Connection) => {
    reconnectSucceeded.current = true;
    setEdges(eds => reconnectEdge(oldEdge, newConn, eds));
  }, [setEdges]);
  const onReconnectEnd = useCallback((_: unknown, edge: Edge) => {
    if (!reconnectSucceeded.current) {
      setEdges(eds => eds.filter(e => e.id !== edge.id));
    }
    reconnectSucceeded.current = true;
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => setSelectedNode(node), []);
  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  const updateNodeData = useCallback((id: string, patch: Record<string, any>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelectedNode(prev => prev?.id === id ? { ...prev, data: { ...(prev.data as any), ...patch } } : prev);
  }, [setNodes]);

  const deleteNode = useCallback((id: string) => {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  const addNode = (type: string) => {
    setNodes(nds => [...nds, {
      id: String(Date.now()), type,
      position: { x: 180 + Math.random() * 160, y: 80 + Math.random() * 220 },
      data: { message: '', answerKey: '', options: [], branches: {}, terminalType: 'save_lead', successMessage: '', actions: [] },
    }]);
  };

  const buildPayload = () => {
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    const indexOfNode = (id: string) => sorted.findIndex(sn => sn.id === id);
    const typeMap: Record<string, string> = { selectNode: 'select', freeTextNode: 'free_text', branchNode: 'branch' };

    return sorted.map((n, i) => {
      const d          = n.data as any;
      const isTerminal = n.type === 'terminalNode';
      const type       = isTerminal ? (d.terminalType || 'save_lead') : (typeMap[n.type ?? ''] ?? 'free_text');

      // Select routing is edge-driven: each per-option handle → target stage index.
      let branches: Record<string, number> | undefined;
      if (n.type === 'selectNode') {
        const map: Record<string, number> = {};
        for (const e of edges) {
          if (e.source !== n.id || e.sourceHandle == null) continue;
          const targetIdx = indexOfNode(e.target);
          if (targetIdx !== -1) map[String(e.sourceHandle)] = targetIdx;
        }
        if (Object.keys(map).length) branches = map;
      } else if (Object.keys(d.branches ?? {}).length) {
        // branch nodes keep their manual answer→stage map
        branches = d.branches;
      }

      const actions = serializeActions(d.actions ?? []);

      return {
        stage:     i,
        id:        d.answerKey || `stage_${i}`,
        type,
        message:   isTerminal ? '' : (d.message ?? ''),
        answerKey: isTerminal ? undefined : (d.answerKey || `answer_${i}`),
        options:   d.options?.length ? d.options : undefined,
        branches,
        actions:   actions.length ? actions : undefined,
        terminal:  isTerminal ? { type, successMessage: d.successMessage ?? '' } : undefined,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true); setSaveStatus('idle');
    try {
      await apiFetch(`/platform/bots/${slug}/flows`, { method: 'PUT', body: JSON.stringify({ flows: buildPayload() }) });
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch { setSaveStatus('error'); }
    finally   { setSaving(false); }
  };

  const handlePreview = async () => {
    setTesting(true);
    try {
      const r = await apiFetch(`/platform/bots/${slug}/flows/preview`, { method: 'POST', body: JSON.stringify({ simulatedAnswers: {} }) });
      alert(`Score: ${r.score}\nClassification: ${r.classification}\nMessage: ${r.routingMessage}`);
    } catch { alert('Preview failed — save the flow first.'); }
    finally  { setTesting(false); }
  };

  const PALETTE_ITEMS = [
    { type: 'selectNode',   label: 'Select',    color: '#e2603f' },
    { type: 'freeTextNode', label: 'Free Text', color: '#c9a27a' },
    { type: 'branchNode',   label: 'Branch',    color: '#fbbf24' },
    { type: 'terminalNode', label: 'Terminal',  color: '#f87171' },
  ];

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 60px)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.08] bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Flow Builder</span>
          <span className="text-xs text-muted px-2 py-0.5 rounded bg-white/5">{slug}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PALETTE_ITEMS.map(p => (
            <button
              key={p.type}
              onClick={() => addNode(p.type)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all hover:scale-105 active:scale-95"
              style={{ borderColor: p.color, color: p.color, background: `${p.color}15` }}
            >
              <Plus size={11} /> {p.label}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <button onClick={handlePreview} disabled={testing}
            className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Play size={13} /> {testing ? 'Testing…' : 'Test'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {saveStatus === 'ok'    ? <><CheckCircle size={13}/> Saved!</>  :
             saveStatus === 'error' ? <><AlertCircle size={13}/> Error</>   :
                                     <><Save         size={13}/> {saving ? 'Saving…' : 'Save'}</>}
          </button>
        </div>
      </div>

      {/* Canvas row */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0" style={{ position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            defaultEdgeOptions={{ type: 'deletable', animated: true, style: EDGE_STYLE }}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            style={{ background: '#0a0a0a' }}
          >
            <Background color="#1f1f1f" gap={24} />
            <Controls style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
            <MiniMap
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}
              nodeColor="#e2603f"
            />
          </ReactFlow>
        </div>

        {selectedNode && (
          <NodeEditorPanel
            node={selectedNode}
            slug={slug}
            onChange={updateNodeData}
            onDelete={deleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Hint bar */}
      <div className="flex items-center gap-3 px-5 py-1.5 border-t border-white/5 text-[10px] text-muted bg-base flex-shrink-0">
        <span>Click a node to edit its properties</span>
        <span>·</span>
        <span>On a Select node, drag each option’s handle to the node that choice should lead to</span>
        <span>·</span>
        <span>Hover a line and click × to delete a connection</span>
        <span>·</span>
        <span>Drag an edge end onto another node to re-route it</span>
        <span>·</span>
        <span>Stage order = top-to-bottom position at save time</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FlowBuilderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  return (
    <div className="-mx-8 -my-8 overflow-hidden">
      <ReactFlowProvider>
        <FlowCanvas slug={slug} />
      </ReactFlowProvider>
    </div>
  );
}
