'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, getAccessToken } from '@/lib/tokens';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken() || !getUser()) {
      router.replace('/login');
    }
  }, [router]);

  return <>{children}</>;
}