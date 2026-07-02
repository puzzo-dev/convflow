'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Users, Loader2, UserPlus, Trash2, X, AlertCircle, Pencil } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { EditNameModal } from '../admin/users/page';

const fetcher = (url: string) => apiFetch(url);

const ROLES = ['owner', 'admin', 'member', 'viewer'];
const RANK: Record<string, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

interface Member { userId: string; name: string; email: string; active: boolean; role: string; isYou: boolean; }

const ROLE_BADGE: Record<string, string> = {
  owner:  'bg-accent/20 text-accent',
  admin:  'bg-warning/15 text-warning',
  member: 'bg-white/5 text-secondary',
  viewer: 'bg-white/5 text-muted',
};

export default function TeamPage() {
  const { data: orgData, mutate: mutateOrg } = useSWR('/platform/org', fetcher);
  const { data, isLoading, mutate } = useSWR('/platform/org/members', fetcher);
  const [renaming, setRenaming] = useState(false);

  const members: Member[] = data?.members ?? [];
  const myRole: string    = data?.role ?? orgData?.role ?? 'viewer';
  const canManage         = RANK[myRole] >= RANK['admin'];
  const isOwner           = myRole === 'owner';

  const [showInvite, setShowInvite] = useState(false);

  const changeRole = async (m: Member, role: string) => {
    await apiFetch(`/platform/org/members/${m.userId}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    await mutate();
  };
  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.name} from the organization?`)) return;
    await apiFetch(`/platform/org/members/${m.userId}`, { method: 'DELETE' });
    await mutate();
  };

  // Which roles the current user may assign (admins can't grant owner).
  const assignable = ROLES.filter(r => r !== 'owner' || isOwner);

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users size={28} className="text-accent" /> Team
            {canManage && orgData?.org && (
              <button onClick={() => setRenaming(true)} className="text-muted hover:text-primary" title="Rename organization"><Pencil size={16} /></button>
            )}
          </h1>
          <p className="text-secondary mt-2">
            {orgData?.org?.name ? `Members of ${orgData.org.name}.` : 'Members of your organization.'} Roles apply across all the org’s bots.
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} className="btn btn-primary flex items-center gap-2">
            <UserPlus size={17} /> Add Member
          </button>
        )}
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Status', canManage ? 'Actions' : ''].filter(Boolean).map(h => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider bg-white/3 border-b border-white/10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-16 text-center text-muted"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
              ) : members.map(m => {
                // Admins can't modify owners or themselves.
                const editable = canManage && !m.isYou && (isOwner || RANK[m.role] < RANK['owner']);
                return (
                  <tr key={m.userId} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5 font-medium">{m.name} {m.isYou && <span className="text-[10px] text-muted">(you)</span>}</td>
                    <td className="px-5 py-3.5 text-secondary">{m.email}</td>
                    <td className="px-5 py-3.5">
                      {editable ? (
                        <select
                          className="input text-xs w-28 py-1"
                          value={m.role}
                          onChange={e => changeRole(m, e.target.value)}
                        >
                          {assignable.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span className={`badge ${ROLE_BADGE[m.role] ?? ''}`}>{m.role}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`badge ${m.active ? 'bg-success/15 text-success' : 'bg-danger/10 text-danger'}`}>{m.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3.5">
                        {editable && (
                          <button onClick={() => remove(m)} className="text-danger hover:opacity-80"><Trash2 size={15} /></button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <InviteModal
          assignable={assignable}
          onClose={() => setShowInvite(false)}
          onDone={async () => { setShowInvite(false); await mutate(); }}
        />
      )}

      {renaming && orgData?.org && (
        <EditNameModal
          title="Rename Organization"
          label="Organization name"
          initial={orgData.org.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            await apiFetch('/platform/org', { method: 'PATCH', body: JSON.stringify({ name }) });
            await mutateOrg();
            setRenaming(false);
          }}
        />
      )}
    </>
  );
}

function InviteModal({ assignable, onClose, onDone }: { assignable: string[]; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole]   = useState('member');
  const [createNew, setCreateNew] = useState(false);
  const [name, setName]   = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body: any = { email, role };
      if (createNew) { body.name = name; body.password = password; }
      await apiFetch('/platform/org/members', { method: 'POST', body: JSON.stringify(body) });
      onDone();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="glass-panel w-full max-w-md p-8 relative max-h-[90vh] overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-primary"><X size={18} /></button>
        <h2 className="text-xl font-bold mb-1">Add Member</h2>
        <p className="text-secondary text-sm mb-6">Add an existing user by email, or create a new account for them.</p>

        {error && <div className="mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm flex items-center gap-2"><AlertCircle size={16} /> {error}</div>}

        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" required />
          </div>

          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
            <input type="checkbox" checked={createNew} onChange={e => setCreateNew(e.target.checked)} />
            This person doesn’t have an account yet — create one
          </label>

          {createNew && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} required={createNew} />
              </div>
              <div>
                <label className="label">Temp Password</label>
                <input type="text" className="input" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="min 8 chars" required={createNew} />
              </div>
            </div>
          )}

          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {assignable.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary mt-1" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin" /> Adding...</> : createNew ? 'Create & Add' : 'Add Member'}
          </button>
        </form>
      </div>
    </div>
  );
}
