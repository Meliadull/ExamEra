import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { useI18n } from './i18n';
import type { AuthConfig, User } from './types';

interface AuthState {
  user: User | null;
  config: AuthConfig | null;
  ready: boolean;
  unread: number;
  setSession: (r: { user: User; unreadNotifications?: number }) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUnread: (n: number) => void;
}

const Ctx = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const { setLang } = useI18n();

  const setSession = useCallback(
    (r: { user: User; unreadNotifications?: number }) => {
      setUser(r.user);
      setUnread(r.unreadNotifications ?? 0);
      if (r.user.language === 'ru' || r.user.language === 'uz') setLang(r.user.language);
    },
    [setLang],
  );

  const refresh = useCallback(async () => {
    try {
      setSession(await api('/auth/me'));
    } catch {
      setUser(null);
    }
  }, [setSession]);

  useEffect(() => {
    Promise.all([api<AuthConfig>('/auth/config').then(setConfig).catch(() => null), refresh()]).finally(() => setReady(true));
    const onUnauth = () => setUser(null);
    window.addEventListener('ee:unauthorized', onUnauth);
    return () => window.removeEventListener('ee:unauthorized', onUnauth);
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      api<{ unread: number }>('/notifications')
        .then((r) => setUnread(r.unread))
        .catch(() => null);
    }, 60_000);
    return () => clearInterval(id);
  }, [user]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, config, ready, unread, setSession, refresh, logout, setUnread }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function useMe(): User {
  const { user } = useAuth();
  if (!user) throw new Error('not authenticated');
  return user;
}

export const fullName = (u?: { first_name: string; last_name: string } | null) => (u ? `${u.first_name} ${u.last_name}` : '');
