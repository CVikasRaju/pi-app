'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getSession, setSession, redirectToLogin } from '../lib/catalystAuth';

/**
 * useAuth — hook that handles auth guard logic.
 * Returns { user, loading } where user is null until authenticated.
 * Redirects to Catalyst login if no valid session.
 */
export function useAuth() {
  const router  = useRouter();
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      // 1. Try local session cache first (avoids flicker on re-visits)
      const cached = getSession();
      if (cached) {
        setUser(cached);
        setLoading(false);
        // Silently re-validate in background
        getCurrentUser().then(fresh => {
          if (fresh) { setUser(fresh); setSession(fresh); }
          else { redirectToLogin(); }
        });
        return;
      }

      // 2. Fetch from pi-api
      const u = await getCurrentUser();
      if (u) {
        setSession(u);
        setUser(u);
      } else {
        redirectToLogin();
      }
      setLoading(false);
    }

    check();
  }, []);

  return { user, loading };
}

/**
 * ProtectedRoute — wraps a page component to ensure authentication.
 * Shows a loading spinner while resolving, then renders children with user prop.
 *
 * Usage:
 *   export default function DashboardPage() {
 *     return (
 *       <ProtectedRoute>
 *         {({ user }) => <DashboardContent user={user} />}
 *       </ProtectedRoute>
 *     );
 *   }
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner-wrap">
          <div className="auth-spinner" />
          <p className="auth-loading-text">Verifying identity…</p>
        </div>
      </div>
    );
  }

  if (!user) return null; // redirectToLogin() was called in useAuth

  // Optional role guard
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner-wrap">
          <p className="auth-loading-text" style={{ color: '#EF4444' }}>
            Access denied. Your role ({user.role}) does not have access to this page.
          </p>
        </div>
      </div>
    );
  }

  return typeof children === 'function' ? children({ user }) : children;
}
