'use client';
import useSWR from 'swr';
import Link from 'next/link';
import { Building2, Users, Boxes, Plug } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fetcher = (url: string) => apiFetch(url);

function Stat({ icon, label, value, sub, href }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; href: string;
}) {
  return (
    <Link href={href} className="glass-panel p-6 flex flex-col gap-3 hover:border-accent/30 transition-colors">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-secondary">{label}</span>
        {icon}
      </div>
      <div className="text-4xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </Link>
  );
}

export default function AdminOverview() {
  const { data: usersData }   = useSWR('/platform/admin/users', fetcher);
  const { data: botsData }    = useSWR('/platform/bots', fetcher);
  const { data: pluginsData } = useSWR('/platform/plugins', fetcher);

  const users:   any[] = usersData?.users ?? [];
  const bots:    any[] = botsData?.bots ?? [];
  const plugins: any[] = pluginsData?.plugins ?? [];

  const businesses = users.filter(u => u.role !== 'super_admin').length;
  const activeBots = bots.filter(b => b.active).length;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Platform Overview</h1>
        <p className="text-secondary mt-2">System-wide view across all tenants.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat icon={<Building2 size={20} className="text-accent" />}          label="Tenants"  value={businesses}     sub="business accounts" href="/admin/tenants" />
        <Stat icon={<Users size={20} className="text-accent-secondary" />}    label="Users"    value={users.length}   sub="all dashboard users" href="/admin/users" />
        <Stat icon={<Boxes size={20} className="text-success" />}             label="Bots"     value={bots.length}    sub={`${activeBots} active`} href="/admin/bots" />
        <Stat icon={<Plug size={20} className="text-warning" />}              label="Plugins"  value={plugins.length} sub="installed connectors" href="/admin/plugins" />
      </div>
    </>
  );
}
