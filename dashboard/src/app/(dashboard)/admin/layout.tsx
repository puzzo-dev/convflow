'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// Client guard: the /admin/* console is super-admin only. The backend enforces
// this too (requireAdmin); this just keeps non-admins from seeing the shell.
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role ?? (session as any)?.role;

  useEffect(() => {
    if (status === 'authenticated' && role !== 'super_admin') router.replace('/');
  }, [status, role, router]);

  if (status === 'loading') return <div className="p-8 text-secondary">Loading…</div>;
  if (role !== 'super_admin') return <div className="p-8 text-danger">Forbidden — super admin only.</div>;
  return <>{children}</>;
}
