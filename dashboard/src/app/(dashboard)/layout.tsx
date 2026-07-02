'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Bot, LayoutDashboard, Settings, User, LogOut, MessageSquare, Database, LineChart,
  Workflow, PlusCircle, Shield, Bell, ChevronDown, Users, Boxes, Building2, Plug,
} from 'lucide-react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

interface BotSummary { slug: string; name: string; active: boolean; }

const fetcher = (url: string) => apiFetch(url);

// ─── Shared bits ──────────────────────────────────────────────────────────────

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 ${
        active
          ? 'bg-accent/15 text-accent shadow-[inset_0_0_0_1px_rgba(226,96,63,0.25)]'
          : 'text-secondary hover:bg-white/5 hover:text-primary'
      }`}
    >
      {children}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-1 pl-4 text-[10px] font-bold text-muted uppercase tracking-widest">
      {children}
    </div>
  );
}

// Sidebar brand. Shows an ADMIN tag in the operator console.
function Brand({ admin }: { admin?: boolean }) {
  return (
    <div className="p-5 border-b border-white/10 flex-shrink-0">
      <div className="text-xl font-bold flex items-center gap-3">
        <Bot size={22} className="text-accent" />
        <span>ConvFlow</span>
        {admin && <span className="text-[9px] font-bold tracking-widest bg-accent/20 text-accent px-1.5 py-0.5 rounded">ADMIN</span>}
      </div>
      <div className="text-[11px] text-muted mt-0.5 pl-9">{admin ? 'Platform Console' : 'WhatsApp Workflow Engine'}</div>
    </div>
  );
}

function Footer({ email }: { email: string }) {
  return (
    <div className="p-3 border-t border-white/10 flex-shrink-0">
      <div className="px-4 py-2 text-xs text-muted mb-2 truncate">{email}</div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center gap-3 px-4 py-2.5 rounded-lg w-full font-medium text-sm text-danger hover:bg-white/5 transition-all duration-150"
      >
        <LogOut size={17} /> Sign Out
      </button>
    </div>
  );
}

// Dropdown that switches the active bot; scales to any number of bots.
function BotSwitcher({ bots, activeSlug }: { bots: BotSummary[]; activeSlug: string | null }) {
  const [open, setOpen] = useState(false);
  const active = bots.find(b => b.slug === activeSlug);

  return (
    <div className="relative px-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/20 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Bot size={15} className="text-accent flex-shrink-0" />
          <span className="truncate font-medium">{active?.name ?? 'Choose a bot'}</span>
        </span>
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-1 right-1 mt-1 z-20 rounded-lg border border-white/10 bg-surface shadow-xl overflow-hidden max-h-72 overflow-y-auto no-scrollbar">
            {bots.length === 0 && <div className="px-3 py-3 text-xs text-muted">No bots yet</div>}
            {bots.map(b => (
              <Link
                key={b.slug}
                href={`/bots/${b.slug}/flows`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                  b.slug === activeSlug ? 'bg-accent/10 text-accent' : 'text-secondary hover:bg-white/5 hover:text-primary'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${b.active ? 'bg-success' : 'bg-muted'}`} />
                <span className="truncate">{b.name}</span>
              </Link>
            ))}
            <Link
              href="/bots"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-accent border-t border-white/10 hover:bg-white/5"
            >
              <PlusCircle size={14} /> New / manage bots
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// The section links for one active bot.
function BotSections({ slug, pathname }: { slug: string; pathname: string }) {
  const is = (page: string) => pathname === `/bots/${slug}/${page}`;
  return (
    <div className="flex flex-col gap-0.5">
      <NavLink href={`/bots/${slug}/connect`}       active={is('connect')}>       <Bot size={16} /> Connect</NavLink>
      <NavLink href={`/bots/${slug}/flows`}         active={is('flows')}>         <Workflow size={16} /> Flow Builder</NavLink>
      <NavLink href={`/bots/${slug}/leads`}         active={is('leads')}>         <User size={16} /> Leads</NavLink>
      <NavLink href={`/bots/${slug}/conversations`} active={is('conversations')}> <MessageSquare size={16} /> Conversations</NavLink>
      <NavLink href={`/bots/${slug}/analytics`}     active={is('analytics')}>     <LineChart size={16} /> Analytics</NavLink>
      <NavLink href={`/bots/${slug}/integrations`}  active={is('integrations')}>  <Database size={16} /> Integrations</NavLink>
      <NavLink href={`/bots/${slug}/settings`}      active={is('settings')}>      <Settings size={16} /> Settings</NavLink>
    </div>
  );
}

// ─── Tenant shell ─────────────────────────────────────────────────────────────

function TenantShell({ pathname, activeSlug, email }: { pathname: string; activeSlug: string | null; email: string }) {
  const { data } = useSWR('/platform/bots', fetcher, { refreshInterval: 60_000 });
  const bots: BotSummary[] = data?.bots ?? [];

  return (
    <>
      <Brand />
      <nav className="p-3 flex-1 flex flex-col">
        <NavLink href="/" active={pathname === '/'}><LayoutDashboard size={17} /> Overview</NavLink>
        <NavLink href="/bots" active={pathname === '/bots'}><Boxes size={17} /> All Bots</NavLink>

        <SectionLabel>Bot</SectionLabel>
        <BotSwitcher bots={bots} activeSlug={activeSlug} />
        {activeSlug && <div className="mt-1"><BotSections slug={activeSlug} pathname={pathname} /></div>}

        <SectionLabel>Account</SectionLabel>
        <NavLink href="/team" active={pathname.startsWith('/team')}><Users size={16} /> Team</NavLink>
        <NavLink href="/account" active={pathname === '/account'}><User size={16} /> Account Profile</NavLink>
        <NavLink href="/account/notifications" active={pathname.startsWith('/account/notifications')}><Bell size={16} /> Notifications</NavLink>
      </nav>
      <Footer email={email} />
    </>
  );
}

// ─── Admin shell (operator console) ───────────────────────────────────────────

function AdminShell({ pathname, activeSlug, email }: { pathname: string; activeSlug: string | null; email: string }) {
  return (
    <>
      <Brand admin />
      <nav className="p-3 flex-1 flex flex-col">
        <NavLink href="/admin"         active={pathname === '/admin'}>              <LayoutDashboard size={17} /> Overview</NavLink>
        <NavLink href="/admin/tenants" active={pathname.startsWith('/admin/tenants')}><Building2 size={17} /> Tenants</NavLink>
        <NavLink href="/admin/users"   active={pathname.startsWith('/admin/users')}> <Users size={17} /> Users</NavLink>
        <NavLink href="/admin/bots"    active={pathname.startsWith('/admin/bots')}>  <Boxes size={17} /> All Bots</NavLink>
        <NavLink href="/admin/plugins" active={pathname.startsWith('/admin/plugins')}><Plug size={17} /> Plugins</NavLink>

        {/* Drill-in: when an admin opens a specific bot, expose its sections. */}
        {activeSlug && (
          <>
            <SectionLabel>Viewing Bot</SectionLabel>
            <BotSections slug={activeSlug} pathname={pathname} />
          </>
        )}

        <SectionLabel>Account</SectionLabel>
        <NavLink href="/account" active={pathname === '/account'}><User size={16} /> Account Profile</NavLink>
        <NavLink href="/account/notifications" active={pathname.startsWith('/account/notifications')}><Bell size={16} /> Notifications</NavLink>
      </nav>
      <Footer email={email} />
    </>
  );
}

// Human-readable breadcrumb from the path. Known segments get friendly labels;
// a bot slug is resolved to the bot's name when available.
const SEGMENT_LABELS: Record<string, string> = {
  bots: 'Bots', flows: 'Flow Builder', leads: 'Leads', conversations: 'Conversations',
  analytics: 'Analytics', integrations: 'Integrations', settings: 'Settings', connect: 'Connect',
  account: 'Account', notifications: 'Notifications', admin: 'Admin', tenants: 'Tenants',
  users: 'Users', plugins: 'Plugins',
};

function Breadcrumbs({ pathname, botName }: { pathname: string; botName?: string }) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return <span className="text-secondary text-xs">Overview</span>;

  const crumbs = segments.map((seg, i) => {
    // The slug right after "bots" → show the bot's name if we have it.
    if (i === 1 && segments[0] === 'bots') return botName ?? seg;
    return SEGMENT_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
  });

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted">›</span>}
          <span className={i === crumbs.length - 1 ? 'text-primary font-medium' : 'text-secondary'}>{c}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role   = (session?.user as any)?.role ?? (session as any)?.role;
  const email  = (session?.user as any)?.email ?? '';
  const name   = (session?.user?.name ?? 'U').charAt(0).toUpperCase();
  const isAdmin = role === 'super_admin';

  const activeSlug = pathname.match(/^\/bots\/([^/]+)/)?.[1] ?? null;

  // Shared with the shells via SWR's dedup — resolves the active bot's name for the breadcrumb.
  const { data: botsData } = useSWR('/platform/bots', fetcher, { refreshInterval: 60_000 });
  const activeBotName = (botsData?.bots ?? []).find((b: BotSummary) => b.slug === activeSlug)?.name;

  return (
    <div className="flex min-h-screen">
      <aside className="w-[260px] border-r border-white/[0.08] bg-surface flex flex-col sticky top-0 h-screen overflow-y-auto no-scrollbar">
        {isAdmin
          ? <AdminShell  pathname={pathname} activeSlug={activeSlug} email={email} />
          : <TenantShell pathname={pathname} activeSlug={activeSlug} email={email} />}
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] border-b border-white/[0.08] bg-base flex items-center justify-between px-8 sticky top-0 z-10">
          <Breadcrumbs pathname={pathname} botName={activeBotName} />
          <div className="flex items-center gap-3">
            {isAdmin && <span className="text-[10px] font-bold tracking-wider text-accent">SUPER ADMIN</span>}
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-xs font-bold">
              {name}
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
