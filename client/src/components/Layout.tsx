import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  User as UserIcon,
  UserCog,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { fullName, useAuth, useMe } from '../auth';
import { LANGS, useI18n } from '../i18n';
import { ThemeToggle } from '../theme';
import type { Role } from '../types';
import { Logo } from './Logo';
import { Avatar } from './ui';

interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  end?: boolean;
}

const I = {
  dash: <LayoutDashboard />,
  tests: <FileText />,
  questions: <HelpCircle />,
  schedule: <CalendarDays />,
  groups: <Users />,
  students: <GraduationCap />,
  subjects: <BookOpen />,
  results: <Trophy />,
  analytics: <BarChart3 />,
  reports: <FileSpreadsheet />,
  audit: <ScrollText />,
  settings: <Settings />,
  users: <UserCog />,
  roles: <ShieldCheck />,
  history: <History />,
  myTests: <ClipboardList />,
  bell: <Bell />,
  profile: <UserIcon />,
};

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: '/app', key: 'nav.dashboard', icon: I.dash, end: true },
    { to: '/app/my-tests', key: 'nav.myTests', icon: I.myTests },
    { to: '/app/results', key: 'nav.results', icon: I.results },
    { to: '/app/history', key: 'nav.history', icon: I.history },
    { to: '/app/notifications', key: 'nav.notifications', icon: I.bell },
    { to: '/app/profile', key: 'nav.profile', icon: I.profile },
  ],
  teacher: [
    { to: '/app', key: 'nav.dashboard', icon: I.dash, end: true },
    { to: '/app/tests', key: 'nav.tests', icon: I.tests },
    { to: '/app/questions', key: 'nav.questions', icon: I.questions },
    { to: '/app/assignments', key: 'nav.assignments', icon: I.schedule },
    { to: '/app/groups', key: 'nav.groups', icon: I.groups },
    { to: '/app/students', key: 'nav.students', icon: I.students },
    { to: '/app/subjects', key: 'nav.subjects', icon: I.subjects },
    { to: '/app/results', key: 'nav.results', icon: I.results },
    { to: '/app/analytics', key: 'nav.analytics', icon: I.analytics },
    { to: '/app/reports', key: 'nav.reports', icon: I.reports },
    { to: '/app/audit', key: 'nav.audit', icon: I.audit },
  ],
  admin: [
    { to: '/app', key: 'nav.dashboard', icon: I.dash, end: true },
    { to: '/app/users', key: 'nav.users', icon: I.users },
    { to: '/app/roles', key: 'nav.roles', icon: I.roles },
    { to: '/app/groups', key: 'nav.groups', icon: I.groups },
    { to: '/app/subjects', key: 'nav.subjects', icon: I.subjects },
    { to: '/app/tests', key: 'nav.tests', icon: I.tests },
    { to: '/app/assignments', key: 'nav.assignments', icon: I.schedule },
    { to: '/app/results', key: 'nav.results', icon: I.results },
    { to: '/app/analytics', key: 'nav.systemAnalytics', icon: I.analytics },
    { to: '/app/reports', key: 'nav.reports', icon: I.reports },
    { to: '/app/audit', key: 'nav.audit', icon: I.audit },
    { to: '/app/settings', key: 'nav.settings', icon: I.settings },
  ],
  auditor: [
    { to: '/app', key: 'nav.dashboard', icon: I.dash, end: true },
    { to: '/app/users', key: 'nav.users', icon: I.users },
    { to: '/app/tests', key: 'nav.tests', icon: I.tests },
    { to: '/app/results', key: 'nav.results', icon: I.results },
    { to: '/app/analytics', key: 'nav.analytics', icon: I.analytics },
    { to: '/app/reports', key: 'nav.reports', icon: I.reports },
    { to: '/app/audit', key: 'nav.audit', icon: I.audit },
  ],
};

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label="language">
      {LANGS.map((l) => (
        <button key={l.code} className={lang === l.code ? 'active' : ''} onClick={() => setLang(l.code)} title={l.label}>
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function GlobalSearch() {
  const { t } = useI18n();
  const me = useMe();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (q.trim().length < 2) return setRes(null);
    const id = setTimeout(() => {
      api('/search', { query: { q: q.trim() } })
        .then((r) => {
          setRes(r);
          setOpen(true);
        })
        .catch(() => null);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const userLink = (u: any) => (u.role === 'student' ? `/app/students/${u.id}` : `/app/users/${u.id}`);
  const total = res ? Object.values(res).reduce((s: number, a: any) => s + a.length, 0) : 0;
  return (
    <div className="search" ref={ref}>
      <Search />
      <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res && setOpen(true)} />
      {open && res && (
        <div className="search-pop">
          {total === 0 && <div className="small muted" style={{ padding: 10 }}>{t('common.nothingFound')}</div>}
          {res.users.length > 0 && <div className="grp">{t('search.users')}</div>}
          {res.users.map((u: any) => (
            <Link key={`u${u.id}`} to={userLink(u)}>
              {u.last_name} {u.first_name} <span className="small muted">· {t(`role.${u.role}`)}</span>
            </Link>
          ))}
          {res.groups.length > 0 && <div className="grp">{t('search.groups')}</div>}
          {res.groups.map((g: any) => (
            <Link key={`g${g.id}`} to={`/app/groups/${g.id}`}>
              {g.name} <span className="small muted">· {g.academic_year}</span>
            </Link>
          ))}
          {res.tests.length > 0 && <div className="grp">{t('search.tests')}</div>}
          {res.tests.map((x: any) => (
            <Link key={`t${x.id}`} to={me.role === 'student' ? '/app/my-tests' : `/app/tests/${x.id}`}>
              {x.title} <span className="small muted">· {x.subject_name}</span>
            </Link>
          ))}
          {res.subjects.length > 0 && <div className="grp">{t('search.subjects')}</div>}
          {res.subjects.map((s: any) => (
            <Link key={`s${s.id}`} to={me.role === 'student' ? '/app/my-tests' : '/app/subjects'}>
              {s.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="rel" ref={ref}>
      <button className="user-chip" onClick={() => setOpen((o) => !o)}>
        <Avatar name={fullName(me)} url={me.avatar_url} />
        <div>
          <div className="name">{fullName(me)}</div>
          <div className="role">{t(`role.${me.role}`)}</div>
        </div>
      </button>
      {open && (
        <div className="dropdown">
          <Link to="/app/profile" onClick={() => setOpen(false)}>
            <UserIcon /> {t('nav.profile')}
          </Link>
          <button
            onClick={async () => {
              await logout();
              nav('/login');
            }}
          >
            <LogOut /> {t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const me = useMe();
  const { unread } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = NAV[me.role];
  const isStudent = me.role === 'student';

  return (
    <div className={`app ${isStudent ? 'has-bottom-nav' : ''}`}>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Logo />
        <nav className="nav">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              {i.icon}
              {t(i.key)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <nav className="nav">
            {!isStudent && (
              <NavLink to="/app/profile">
                {I.profile}
                {t('nav.profile')}
              </NavLink>
            )}
          </nav>
          {me.role === 'auditor' && (
            <div className="alert info small" style={{ marginTop: 8 }}>
              {t('auditor.readOnly')}
            </div>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="menu">
            <Menu />
          </button>
          <GlobalSearch />
          <div className="top-actions">
            <ThemeToggle />
            <LangSwitch />
            <Link to="/app/notifications" className="icon-btn" aria-label={t('nav.notifications')}>
              <Bell />
              {unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
            </Link>
            <UserMenu />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {isStudent && (
        <nav className="bottom-nav">
          {[
            { to: '/app', key: 'nav.home', icon: I.dash, end: true },
            { to: '/app/my-tests', key: 'nav.tests', icon: I.myTests },
            { to: '/app/results', key: 'nav.results', icon: I.results },
            { to: '/app/profile', key: 'nav.profile', icon: I.profile },
          ].map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              {i.icon}
              {t(i.key)}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
