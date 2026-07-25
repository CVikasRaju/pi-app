/**
 * Root page — redirects to /dashboard if session exists, otherwise to /login.
 * Uses client-side check to avoid a server-side redirect that would race the
 * Catalyst session cookie.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getCurrentUser, setSession } from '../lib/catalystAuth';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      // Quick: check cached session
      const cached = getSession();
      if (cached) {
        router.replace('/dashboard');
        return;
      }
      // Slower: verify with pi-api
      const user = await getCurrentUser();
      if (user) {
        setSession(user);
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
    redirect();
  }, [router]);

  return (
    <div className="auth-loading-screen">
      <div className="auth-spinner-wrap">
        <div className="auth-spinner" />
        <p className="auth-loading-text">Loading PI App…</p>
      </div>
    </div>
  );
}
