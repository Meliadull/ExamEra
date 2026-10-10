import { Activity, AlertTriangle, Ban, CheckCircle2, FileText, GraduationCap, Info, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserCog, Users as UsersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, del, patch, put, useApi } from '../api';
import { useMe } from '../auth';
import { auditActionLabel, GroupSelect, SubjectSelect, useGroups, useSubjects } from '../components/common';
import { Picker } from '../components/Picker';
import { Avatar, Badge, Button, Card, Check, Confirm, Empty, ErrorBox, Field, Input, Loader, Modal, PageHead, Pager, Select, Stat, Tabs, ToggleRow, useAction } from '../components/ui';
import { useFormat, useI18n } from '../i18n';
import type { Role } from '../types';

const ROLES: Role[] = ['student', 'teacher', 'admin', 'auditor'];
const ROLE_TONE = { student: 'blue', teacher: 'purple', admin: 'red', auditor: 'orange' } as const;

export function AdminDashboard() {
  const { t } = useI18n();
  const f = useFormat();
  const me = useMe();
  const state = useApi<any>('/analytics/admin');
  return (
    <>
      <PageHead title={t('dashboard.hello', { name: me.first_name })} subtitle={me.role === 'auditor' ? t('dashboard.auditorSubtitle') : t('dashboard.adminSubtitle')} />
      <Loader state={state}>
        {(d) => (
          <div className="stack">
            <div className="grid g4">
              <Stat icon={<UsersIcon />} tone="blue" value={d.users.total} label={t('admin.totalUsers')} />
              <Stat icon={<GraduationCap />} tone="green" value={d.users.students} label={t('admin.students')} />
              <Stat icon={<UserCog />} tone="purple" value={d.users.teachers} label={t('admin.teachers')} />
              <Stat icon={<Activity />} tone="orange" value={d.activeUsers} label={t('admin.activeWeek')} />
            </div>
            <div className="grid g4">
              <Stat icon={<FileText />} tone="blue" value={d.tests.active ?? 0} label={t('dashboard.activeTests')} />
              <Stat icon={<CheckCircle2 />} tone="green" value={d.tests.completed ?? 0} label={t('admin.completedTests')} />
              <Stat icon={<ShieldCheck />} tone="purple" value={d.attempts.total} label={t('admin.attempts')} />
              <Stat icon={<CheckCircle2 />} tone="orange" value={f.pct(d.attempts.avg_percentage)} label={t('dashboard.avgResult')} />
            </div>
            <div className="grid g-main">
              <Card title={t('admin.activity')}>
                {d.activity.length ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={d.activity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="#eef1f6" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={f.shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip labelFormatter={(l: string) => f.date(l)} contentStyle={{ borderRadius: 10, fontSize: 12.5 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="logins" name={t('admin.logins')} stroke="#2563eb" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="attempts" name={t('admin.finishedAttempts')} stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="failed_logins" name={t('admin.failedLogins')} stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty title={t('common.noData')} />
                )}
              </Card>
              <Card title={t('admin.notifications')}>
                {d.alerts.length ? (
                  d.alerts.map((a: any) => (
                    <div key={a.type} className={`alert ${a.level === 'danger' ? 'error' : a.level} mb`} style={{ marginBottom: 8 }}>
                      {a.level === 'info' ? <Info /> : <AlertTriangle />}
                      <span>{t(`admin.alert.${a.type}`, a.params)}</span>
                    </div>
                  ))
                ) : (
                  <div className="alert success">
                    <CheckCircle2 /> {t('admin.allGood')}
                  </div>
                )}
                <div className="grid g2 mt" style={{ gap: 10 }}>
                  <div>
                    <div className="stat-label">{t('nav.groups')}</div>
                    <div className="bold">{d.groups}</div>
                  </div>
                  <div>
                    <div className="stat-label">{t('admin.blocked')}</div>
                    <div className="bold">{d.users.blocked ?? 0}</div>
                  </div>
                  <div>
                    <div className="stat-label">{t('admin.drafts')}</div>
                    <div className="bold">{d.tests.drafts ?? 0}</div>
                  </div>
                  <div>
                    <div className="stat-label">{t('admin.inProgress')}</div>
                    <div className="bold">{d.attempts.in_progress ?? 0}</div>
                  </div>
                </div>
              </Card>
            </div>
            <Card title={t('admin.recentEvents')} action={<Link to="/app/audit">{t('common.viewAll')}</Link>}>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {d.recentAudit.map((r: any) => (
                      <tr key={r.id}>
                        <td className="nowrap small muted">{f.dateTime(r.created_at)}</td>
                        <td className="bold">{r.user_name ?? '—'}</td>
                        <td>{auditActionLabel(t, r.action)}</td>
                        <td>
                          <Badge tone={r.result === 'success' ? 'green' : 'red'}>{t(`audit.${r.result}`)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </Loader>
    </>
  );
}

function TempPassword({ value, onClose }: { value: string; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal title={t('users.tempPassword')} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>{t('common.done')}</Button>}>
      <p style={{ marginTop: 0 }}>{t('users.tempPasswordText')}</p>
      <div className="card center mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, boxShadow: 'none' }}>
        {value}
      </div>
    </Modal>
  );
}

/** Edits contact details of an existing (self-registered) account. */
function UserForm({ u, onClose, onDone }: { u: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ firstName: u.first_name ?? '', lastName: u.last_name ?? '', phone: u.phone ?? '', email: u.email ?? '' });
  const [err, setErr] = useState<unknown>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setErr(null);
    try {
      await patch(`/users/${u.id}`, { firstName: form.firstName, lastName: form.lastName, phone: form.phone || null, email: form.email || null });
      onDone();
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal
      wide
      title={t('users.edit')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={() => run(submit)} disabled={!form.firstName || !form.lastName}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('profile.firstName')}>
          <Input value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label={t('profile.lastName')}>
          <Input value={form.lastName} onChange={set('lastName')} />
        </Field>
        <Field label={t('auth.phone')}>
          <Input value={form.phone} onChange={set('phone')} placeholder="+998 90 123 45 67" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      {!!err && (
        <div className="mt">
          <ErrorBox error={err} />
        </div>
      )}
    </Modal>
  );
}

const isTeacherRequest = (u: any) => u?.requested_role === 'teacher' && u?.role === 'student';

/** Duties depend on the role: teacher → subjects + groups led, student → groups. */
function DutiesFields({
  role,
  subjectIds,
  groupIds,
  onSubjects,
  onGroups,
  disabled,
}: {
  role: Role;
  subjectIds: number[];
  groupIds: number[];
  onSubjects: (v: number[]) => void;
  onGroups: (v: number[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const subjects = useSubjects();
  const groups = useGroups();
  const subjectOptions = (subjects.data ?? []).map((x) => ({ value: x.id, label: x.name }));
  const groupOptions = (groups.data ?? []).map((g) => ({ value: g.id, label: g.name, hint: g.academic_year }));
  if (role === 'teacher') {
    return (
      <>
        <Field label={t('users.subjectsTaught')} className="full">
          <Picker options={subjectOptions} value={subjectIds} onChange={onSubjects} placeholder={t('picker.chooseSubjects')} disabled={disabled} ariaLabel={t('users.subjectsTaught')} />
        </Field>
        <Field label={t('users.groupsLed')} className="full">
          <Picker options={groupOptions} value={groupIds} onChange={onGroups} placeholder={t('picker.chooseGroups')} disabled={disabled} ariaLabel={t('users.groupsLed')} />
        </Field>
      </>
    );
  }
  if (role === 'student') {
    return (
      <Field label={t('users.studentGroups')} className="full">
        <Picker options={groupOptions} value={groupIds} onChange={onGroups} placeholder={t('picker.chooseGroups')} disabled={disabled} ariaLabel={t('users.studentGroups')} />
      </Field>
    );
  }
  return <div className="full small muted">{t('users.noDuties')}</div>;
}

function initialDuties(x: any, role: Role) {
  const relation = role === 'teacher' ? 'teacher' : 'student';
  return {
    subjectIds: role === 'teacher' ? (x.subjects ?? []).map((s: any) => s.id) : [],
    groupIds: (x.groups ?? []).filter((g: any) => g.relation === relation).map((g: any) => g.id),
  };
}

async function saveDuties(x: any, role: Role, subjectIds: number[], groupIds: number[]) {
  if (role !== x.role) await patch(`/users/${x.id}/role`, { role });
  if (role === 'teacher') await put(`/users/${x.id}/teaching`, { subjectIds, groupIds });
  else if (role === 'student') await put(`/users/${x.id}/groups`, { groupIds });
}

/** Role + duties editor shared by the "assign" dialog and the user card. */
function useDutiesState(x: any | null) {
  const [role, setRoleState] = useState<Role>('student');
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const setRole = (r: Role) => {
    setRoleState(r);
    if (x) {
      const d = initialDuties(x, r);
      setSubjectIds(d.subjectIds);
      setGroupIds(d.groupIds);
    }
  };
  useEffect(() => {
    if (!x) return;
    // A self-registered teacher is proposed as "teacher" right away.
    const r: Role = isTeacherRequest(x) ? 'teacher' : x.role;
    setRoleState(r);
    const d = initialDuties(x, r);
    setSubjectIds(d.subjectIds);
    setGroupIds(d.groupIds);
  }, [x]);
  return { role, setRole, subjectIds, setSubjectIds, groupIds, setGroupIds };
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  const { t } = useI18n();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Role)} disabled={disabled}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {t(`role.${r}`)}
        </option>
      ))}
    </Select>
  );
}

/** Admin assigns a role and duties to a user who registered themselves — no credentials are entered here. */
function AssignDutiesModal({ initialUserId, onClose, onDone }: { initialUserId?: number; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(h);
  }, [q]);
  const users = useApi<any>(initialUserId ? null : '/users', { search: dq, pageSize: 30 });
  const [userId, setUserId] = useState<number | null>(initialUserId ?? null);
  const detail = useApi<any>(userId ? `/users/${userId}` : null);
  const x = detail.data && detail.data.id === userId ? detail.data : null;
  const d = useDutiesState(x);
  const [confirm, setConfirm] = useState(false);
  const { busy, run } = useAction();

  const userOptions = (users.data?.items ?? [])
    .filter((u: any) => u.id !== me.id)
    .map((u: any) => ({
      value: u.id,
      label: `${u.last_name} ${u.first_name}`,
      hint: [u.phone ?? u.email, t(`role.${u.role}`), isTeacherRequest(u) ? '⚑ ' + t('users.teacherRequest') : null].filter(Boolean).join(' · '),
    }));

  const save = async () => {
    const ok = await run(async () => {
      await saveDuties(x, d.role, d.subjectIds, d.groupIds);
      return true;
    }, t('common.saved'));
    if (ok) onDone();
  };

  return (
    <Modal
      wide
      title={t('users.assignTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} disabled={!x} onClick={() => (x && d.role !== x.role ? setConfirm(true) : save())}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="alert info mb">
        <Info /> {t('users.assignInfo')}
      </div>
      <div className="form-grid">
        <Field label={t('users.user')} className="full">
          {initialUserId ? (
            <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>
              {x ? `${x.last_name} ${x.first_name}` : '…'}
            </div>
          ) : (
          <Picker
            multiple={false}
            options={userOptions}
            value={userId ? [userId] : []}
            onChange={(v) => setUserId(v[0] ?? null)}
            onSearch={setQ}
            placeholder={t('users.pickUser')}
            ariaLabel={t('users.user')}
          />
          )}
        </Field>
        {x && (
          <>
            {isTeacherRequest(x) && <div className="full alert warning">{t('users.requestedTeacherNote')}</div>}
            <Field label={t('users.role')}>
              <RoleSelect value={d.role} onChange={d.setRole} />
            </Field>
            <Field label={t('users.contacts')}>
              <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', color: 'var(--muted)' }}>
                <span className="ellipsis">{[x.phone, x.email].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            </Field>
            <DutiesFields role={d.role} subjectIds={d.subjectIds} groupIds={d.groupIds} onSubjects={d.setSubjectIds} onGroups={d.setGroupIds} />
          </>
        )}
      </div>
      {confirm && x && (
        <Confirm
          title={t('users.changeRole')}
          text={t('users.roleText', { role: t(`role.${d.role}`) })}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await saveDuties(x, d.role, d.subjectIds, d.groupIds);
            onDone();
          }}
        />
      )}
    </Modal>
  );
}

export function Users() {
  const { t } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const list = useApi<any>('/users', { search, status, method, sort, page });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHead
        title={t('nav.users')}
        subtitle={t('users.subtitle')}
        actions={
          <Link to="/app/roles" className="btn">
            <ShieldCheck size={17} /> {t('roles.tabDuties')}
          </Link>
        }
      />
      <div className="alert info mb">
        <Info /> {t('users.selfRegisterNote')}
      </div>
      <div className="filters">
        <Input className="search-input" placeholder={t('users.search')} value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
        <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
          <option value="">{t('users.anyStatus')}</option>
          {['active', 'blocked', 'archived'].map((x) => (
            <option key={x} value={x}>
              {t(`userStatus.${x}`)}
            </option>
          ))}
        </Select>
        <Select value={method} onChange={(e) => reset(setMethod)(e.target.value)}>
          <option value="">{t('users.anyMethod')}</option>
          <option value="phone">{t('users.methodPhone')}</option>
          <option value="google">{t('users.methodGoogle')}</option>
        </Select>
        <Select value={sort} onChange={(e) => reset(setSort)(e.target.value)}>
          <option value="name">{t('users.sortName')}</option>
          <option value="registered">{t('users.sortRegistered')}</option>
          <option value="login">{t('users.sortLogin')}</option>
        </Select>
      </div>
      <Card flush>
        <Loader state={list}>
          {(d) =>
            d.items.length ? (
              <>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('users.user')}</th>
                        <th>{t('auth.phone')}</th>
                        <th>Email</th>
                        <th>{t('users.method')}</th>
                        <th>{t('profile.registered')}</th>
                        <th>{t('users.lastLogin')}</th>
                        <th>{t('common.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((u: any) => (
                        <tr key={u.id} className="click" onClick={() => nav(`/app/users/${u.id}`)}>
                          <td>
                            <div className="row">
                              <Avatar name={`${u.first_name} ${u.last_name}`} url={u.avatar_url} size={32} />
                              <span>
                                <span className="bold">
                                  {u.last_name} {u.first_name}
                                </span>
                                <div className="tiny muted">{t(`role.${u.role}`)}</div>
                              </span>
                            </div>
                          </td>
                          <td className="nowrap">{u.phone ?? '—'}</td>
                          <td>{u.email ?? '—'}</td>
                          <td>
                            <Badge tone={u.has_google ? 'blue' : 'gray'}>{u.has_google ? t('users.methodGoogle') : t('users.methodPhone')}</Badge>
                          </td>
                          <td className="nowrap small">{f.date(u.created_at)}</td>
                          <td className="nowrap small">{f.dateTime(u.last_login_at)}</td>
                          <td>
                            <Badge tone={u.status === 'active' ? 'green' : u.status === 'blocked' ? 'red' : 'gray'}>{t(`userStatus.${u.status}`)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={d.page} pageSize={d.pageSize} total={d.total} onChange={setPage} />
              </>
            ) : (
              <Empty title={t('common.nothingFound')} />
            )
          }
        </Loader>
      </Card>
    </>
  );
}

/** Read-only summary on the account card; roles and duties are edited in the Roles section. */
function RoleSummaryCard({ x, canEdit }: { x: any; canEdit: boolean }) {
  const { t } = useI18n();
  const led = x.groups.filter((g: any) => g.relation === 'teacher');
  const member = x.groups.filter((g: any) => g.relation === 'student');
  const names = (list: any[], empty: string) => (list.length ? list.map((v) => v.name).join(', ') : <span className="muted">{empty}</span>);
  return (
    <Card title={t('users.roleDuties')}>
      <div className="row wrap gap-sm mb">
        <Badge tone={ROLE_TONE[x.role as Role]}>{t(`role.${x.role}`)}</Badge>
        {isTeacherRequest(x) && <Badge tone="orange">{t('users.teacherRequest')}</Badge>}
      </div>
      {(x.role === 'teacher' || x.role === 'student') && (
        <dl className="kv">
          {x.role === 'teacher' ? (
            <>
              <dt>{t('users.subjectsTaught')}</dt>
              <dd>{names(x.subjects ?? [], t('roles.noSubjects'))}</dd>
              <dt>{t('users.groupsLed')}</dt>
              <dd>{names(led, t('roles.noGroups'))}</dd>
            </>
          ) : (
            <>
              <dt>{t('users.studentGroups')}</dt>
              <dd>{names(member, t('roles.noGroups'))}</dd>
            </>
          )}
        </dl>
      )}
      <div className="alert info mt">{t('roles.manageIn')}</div>
      <Link to={canEdit ? `/app/roles?user=${x.id}` : `/app/roles?q=${encodeURIComponent(x.last_name)}`} className="btn sm mt">
        <ShieldCheck size={15} /> {t('roles.openInRoles')}
      </Link>
    </Card>
  );
}

export function UserDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const f = useFormat();
  const me = useMe();
  const u = useApi<any>(`/users/${id}`);
  const activity = useApi<any[]>(`/users/${id}/activity`);
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { kind: 'status'; status: string } | { kind: 'reset' }>(null);
  const isAdmin = me.role === 'admin';
  const self = Number(id) === me.id;

  return (
    <Loader state={u}>
      {(x) => (
        <>
          <PageHead
            back={{ to: '/app/users', label: t('nav.users') }}
            title={
              <span className="row">
                <Avatar name={`${x.first_name} ${x.last_name}`} url={x.avatar_url} size={52} />
                <span>
                  {x.first_name} {x.last_name}
                  <div className="row gap-sm" style={{ marginTop: 6 }}>
                    <Badge tone={ROLE_TONE[x.role as Role]}>{t(`role.${x.role}`)}</Badge>
                    {isTeacherRequest(x) && <Badge tone="orange">{t('users.teacherRequest')}</Badge>}
                    <Badge tone={x.status === 'active' ? 'green' : x.status === 'blocked' ? 'red' : 'gray'}>{t(`userStatus.${x.status}`)}</Badge>
                  </div>
                </span>
              </span>
            }
            actions={
              isAdmin &&
              !self && (
                <>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil /> {t('common.edit')}
                  </Button>
                  <Button onClick={() => setConfirm({ kind: 'reset' })}>
                    <KeyRound /> {t('users.resetAccess')}
                  </Button>
                  {x.status === 'active' ? (
                    <Button variant="danger-ghost" onClick={() => setConfirm({ kind: 'status', status: 'blocked' })}>
                      <Ban /> {t('users.block')}
                    </Button>
                  ) : (
                    <Button onClick={() => setConfirm({ kind: 'status', status: 'active' })}>
                      <UserCheck /> {t('users.activate')}
                    </Button>
                  )}
                  {x.status !== 'archived' && (
                    <Button variant="ghost" onClick={() => setConfirm({ kind: 'status', status: 'archived' })}>
                      <Trash2 /> {t('users.archive')}
                    </Button>
                  )}
                </>
              )
            }
          />
          <div className="grid g2">
            <Card title={t('profile.info')}>
              <dl className="kv">
                <dt>{t('auth.phone')}</dt>
                <dd>{x.phone ?? '—'}</dd>
                <dt>Email</dt>
                <dd>{x.email ?? '—'}</dd>
                <dt>Google</dt>
                <dd>{x.has_google ? t('common.yes') : t('common.no')}</dd>
                <dt>{t('nav.groups')}</dt>
                <dd>{x.groups.map((g: any) => g.name).join(', ') || '—'}</dd>
                <dt>{t('profile.registered')}</dt>
                <dd>{f.dateTime(x.created_at)}</dd>
                <dt>{t('users.lastLogin')}</dt>
                <dd>{f.dateTime(x.last_login_at)}</dd>
              </dl>
              {x.role === 'student' && (
                <Link to={`/app/students/${x.id}`} className="btn sm mt">
                  {t('users.studentCard')}
                </Link>
              )}
            </Card>
            <RoleSummaryCard x={x} canEdit={isAdmin && !self} />
          </div>
          <Card title={t('users.activity')} className="mt">
            <Loader state={activity}>
              {(items) =>
                items.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <tbody>
                        {items.map((r) => (
                          <tr key={r.id}>
                            <td className="nowrap small muted">{f.dateTime(r.created_at)}</td>
                            <td>{auditActionLabel(t, r.action)}</td>
                            <td className="small">{r.entity_type ? `${r.entity_type} #${r.entity_id}` : ''}</td>
                            <td>
                              <Badge tone={r.result === 'success' ? 'green' : 'red'}>{t(`audit.${r.result}`)}</Badge>
                            </td>
                            <td className="mono">{r.ip}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title={t('common.noData')} />
                )
              }
            </Loader>
          </Card>
          {editing && (
            <UserForm
              u={x}
              onClose={() => setEditing(false)}
              onDone={() => {
                setEditing(false);
                u.reload();
              }}
            />
          )}
          {confirm && (
            <Confirm
              danger={confirm.kind === 'status' && confirm.status !== 'active'}
              title={confirm.kind === 'reset' ? t('users.resetAccess') : t(`users.statusTitle.${confirm.status}`)}
              text={confirm.kind === 'reset' ? t('users.resetText') : t(`users.statusText.${confirm.status}`)}
              onClose={() => setConfirm(null)}
              onConfirm={async () => {
                if (confirm.kind === 'reset') {
                  const r = await api(`/users/${x.id}/reset-password`, { method: 'POST' });
                  setTemp(r.tempPassword);
                } else await patch(`/users/${x.id}/status`, { status: confirm.status });
                u.reload();
                activity.reload();
              }}
            />
          )}
          {temp && <TempPassword value={temp} onClose={() => setTemp(null)} />}
        </>
      )}
    </Loader>
  );
}

const MATRIX: { key: string; v: Record<Role, 'yes' | 'no' | 'limited' | 'optional' | 'na'> }[] = [
  { key: 'takeTest', v: { student: 'yes', teacher: 'no', admin: 'optional', auditor: 'no' } },
  { key: 'ownResults', v: { student: 'yes', teacher: 'na', admin: 'yes', auditor: 'yes' } },
  { key: 'createTest', v: { student: 'no', teacher: 'yes', admin: 'yes', auditor: 'no' } },
  { key: 'editTest', v: { student: 'no', teacher: 'yes', admin: 'yes', auditor: 'no' } },
  { key: 'assignTest', v: { student: 'no', teacher: 'yes', admin: 'yes', auditor: 'no' } },
  { key: 'groupResults', v: { student: 'no', teacher: 'yes', admin: 'yes', auditor: 'yes' } },
  { key: 'manageUsers', v: { student: 'no', teacher: 'no', admin: 'yes', auditor: 'no' } },
  { key: 'changeRoles', v: { student: 'no', teacher: 'no', admin: 'yes', auditor: 'no' } },
  { key: 'viewAudit', v: { student: 'no', teacher: 'limited', admin: 'yes', auditor: 'yes' } },
  { key: 'settings', v: { student: 'no', teacher: 'no', admin: 'yes', auditor: 'no' } },
];

export function Roles() {
  const { t } = useI18n();
  const me = useMe();
  const isAdmin = me.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'duties' | 'matrix'>('duties');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [role, setRole] = useState(params.get('role') ?? '');
  const [subjectId, setSubjectId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unassigned, setUnassigned] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(isAdmin ? Number(params.get('user')) || null : null);
  const [assigning, setAssigning] = useState(false);
  const list = useApi<any>('/users/duties', { search, role, subjectId, groupId, unassigned: unassigned ? 1 : '', page });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  const closeEdit = () => {
    setEditing(null);
    if (params.get('user')) {
      params.delete('user');
      setParams(params, { replace: true });
    }
  };
  const counts = list.data?.counts;
  const tone = { yes: 'green', no: 'gray', limited: 'orange', optional: 'blue', na: 'gray' } as const;
  const cards: { id: string; label: string; tone: 'blue' | 'purple' | 'red' | 'orange'; n?: number }[] = [
    ...ROLES.map((r) => ({ id: r, label: t(`role.${r}`), tone: ROLE_TONE[r], n: counts?.[r] })),
    { id: 'requests', label: t('users.teacherRequests'), tone: 'orange', n: counts?.requests },
  ];
  const chips = (list: any[], empty: string, warn: boolean) =>
    list.length ? (
      <div className="chip-list">
        {list.map((v) => (
          <span className="chip" key={v.id}>
            {v.name}
          </span>
        ))}
      </div>
    ) : (
      <span className={warn ? 'badge orange' : 'muted small'}>{empty}</span>
    );

  return (
    <>
      <PageHead
        title={t('nav.roles')}
        subtitle={t('roles.subtitle')}
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setAssigning(true)}>
              <UserCog /> {t('users.assignDuties')}
            </Button>
          )
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'duties', label: t('roles.tabDuties'), count: counts?.requests || undefined },
          { id: 'matrix', label: t('roles.tabMatrix') },
        ]}
      />
      {tab === 'duties' ? (
        <>
          <div className="grid mb" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 12 }}>
            {cards.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`card role-card${role === c.id ? ' active' : ''}`}
                aria-pressed={role === c.id}
                onClick={() => reset(setRole)(role === c.id ? '' : c.id)}
              >
                <Badge tone={c.tone}>{c.label}</Badge>
                <div className="stat-value mt-sm">{c.n ?? '—'}</div>
              </button>
            ))}
          </div>
          <div className="filters">
            <Input className="search-input" placeholder={t('users.search')} value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
            <Select value={role} onChange={(e) => reset(setRole)(e.target.value)}>
              <option value="">{t('audit.allRoles')}</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
              <option value="requests">{t('users.teacherRequests')}</option>
            </Select>
            <SubjectSelect value={subjectId} onChange={reset(setSubjectId)} />
            <GroupSelect value={groupId} onChange={reset(setGroupId)} />
            <Check
              checked={unassigned}
              onChange={reset(setUnassigned)}
              label={
                <span>
                  {t('roles.unassignedOnly')} {counts?.unassigned ? <Badge tone="orange">{counts.unassigned}</Badge> : null}
                </span>
              }
            />
          </div>
          <Card flush>
            <Loader state={list}>
              {(d) =>
                d.items.length ? (
                  <>
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('users.user')}</th>
                            <th>{t('users.role')}</th>
                            <th>{t('nav.subjects')}</th>
                            <th>{t('nav.groups')}</th>
                            {isAdmin && <th />}
                          </tr>
                        </thead>
                        <tbody>
                          {d.items.map((u: any) => {
                            const groups = u.groups.filter((g: any) => g.relation === (u.role === 'teacher' ? 'teacher' : 'student'));
                            const hasDuties = u.role === 'teacher' || u.role === 'student';
                            return (
                              <tr key={u.id}>
                                <td>
                                  <div className="row">
                                    <Avatar name={`${u.first_name} ${u.last_name}`} url={u.avatar_url} size={32} />
                                    <span>
                                      <Link to={`/app/users/${u.id}`} className="bold" style={{ color: 'inherit' }}>
                                        {u.last_name} {u.first_name}
                                      </Link>
                                      <div className="tiny muted">{u.phone ?? u.email}</div>
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="row gap-sm wrap">
                                    <Badge tone={ROLE_TONE[u.role as Role]}>{t(`role.${u.role}`)}</Badge>
                                    {isTeacherRequest(u) && <Badge tone="orange">{t('users.teacherRequest')}</Badge>}
                                  </div>
                                </td>
                                <td>{u.role === 'teacher' ? chips(u.subjects, t('roles.noSubjects'), true) : <span className="faint">—</span>}</td>
                                <td>{hasDuties ? chips(groups, t('roles.noGroups'), true) : <span className="faint">—</span>}</td>
                                {isAdmin && (
                                  <td className="right">
                                    {u.id !== me.id && (
                                      <Button size="sm" variant={isTeacherRequest(u) || u.unassigned ? 'primary' : undefined} onClick={() => setEditing(u.id)}>
                                        {isTeacherRequest(u) ? t('roles.approve') : u.unassigned ? t('roles.assign') : t('roles.edit')}
                                      </Button>
                                    )}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pager page={d.page} pageSize={d.pageSize} total={d.total} onChange={setPage} />
                  </>
                ) : (
                  <Empty title={t('common.nothingFound')} />
                )
              }
            </Loader>
          </Card>
        </>
      ) : (
        <>
          <div className="grid g4 mb">
            {ROLES.map((r) => (
              <Card key={r}>
                <Badge tone={ROLE_TONE[r]}>{t(`role.${r}`)}</Badge>
                <div className="small muted mt-sm">{t(`roles.desc.${r}`)}</div>
              </Card>
            ))}
          </div>
          <Card title={t('roles.matrix')} flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('roles.function')}</th>
                    {ROLES.map((r) => (
                      <th key={r}>{t(`role.${r}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((m) => (
                    <tr key={m.key}>
                      <td className="bold">{t(`roles.f.${m.key}`)}</td>
                      {ROLES.map((r) => (
                        <td key={r}>
                          <Badge tone={tone[m.v[r]]}>{t(`roles.v.${m.v[r]}`)}</Badge>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="alert info" style={{ margin: 16 }}>
              {t('roles.serverSide')}
            </div>
          </Card>
        </>
      )}
      {editing && (
        <AssignDutiesModal
          key={editing}
          initialUserId={editing}
          onClose={closeEdit}
          onDone={() => {
            closeEdit();
            list.reload();
          }}
        />
      )}
      {assigning && (
        <AssignDutiesModal
          onClose={() => setAssigning(false)}
          onDone={() => {
            setAssigning(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function Periods({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const list = useApi<any[]>('/admin/periods');
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', startsOn: '', endsOn: '', isCurrent: false });
  const [deleting, setDeleting] = useState<any>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (editing) setForm(editing === 'new' ? { name: '', startsOn: '', endsOn: '', isCurrent: false } : { name: editing.name, startsOn: editing.starts_on, endsOn: editing.ends_on, isCurrent: !!editing.is_current });
  }, [editing]);
  return (
    <Card
      title={t('settings.periods')}
      action={
        !readOnly && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {t('common.add')}
          </Button>
        )
      }
    >
      <Loader state={list}>
        {(items) =>
          items.length ? (
            items.map((p) => (
              <div className="list-item" key={p.id}>
                <div className="grow">
                  <div className="bold">
                    {p.name} {p.is_current ? <Badge tone="green">{t('settings.current')}</Badge> : null}
                  </div>
                  <div className="small muted">
                    {f.date(p.starts_on)} — {f.date(p.ends_on)}
                  </div>
                </div>
                {!readOnly && (
                  <>
                    <Button size="sm" variant="ghost" className="icon" onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                    <Button size="sm" variant="ghost" className="icon" onClick={() => setDeleting(p)}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            ))
          ) : (
            <Empty title={t('common.noData')} />
          )
        }
      </Loader>
      {editing && (
        <Modal
          title={t('settings.period')}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  const ok = await run(() => (editing === 'new' ? api('/admin/periods', { body: form }) : put(`/admin/periods/${editing.id}`, form)), t('common.saved'));
                  if (ok) {
                    setEditing(null);
                    list.reload();
                  }
                }}
              >
                {t('common.save')}
              </Button>
            </>
          }
        >
          <div className="stack" style={{ gap: 14 }}>
            <Field label={t('common.title')}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <div className="form-grid">
              <Field label={t('filters.from')}>
                <Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
              </Field>
              <Field label={t('filters.to')}>
                <Input type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              </Field>
            </div>
            <Check checked={form.isCurrent} onChange={(v) => setForm({ ...form, isCurrent: v })} label={t('settings.current')} />
          </div>
        </Modal>
      )}
      {deleting && (
        <Confirm
          danger
          title={t('common.delete')}
          text={deleting.name}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await del(`/admin/periods/${deleting.id}`);
            list.reload();
          }}
        />
      )}
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const me = useMe();
  const readOnly = me.role !== 'admin';
  const state = useApi<Record<string, string>>('/admin/settings');
  const [s, setS] = useState<Record<string, string> | null>(null);
  const { busy, run } = useAction();
  useEffect(() => {
    if (state.data) setS(state.data);
  }, [state.data]);
  const set = (k: string, v: string) => setS((x) => ({ ...x!, [k]: v }));
  const bool = (k: string) => s?.[k] === '1';
  return (
    <>
      <PageHead
        title={t('nav.settings')}
        subtitle={t('settings.subtitle')}
        actions={
          !readOnly && (
            <Button variant="primary" loading={busy} onClick={() => run(() => put('/admin/settings', s), t('common.saved')).then((r) => r && state.setData(r))}>
              {t('common.save')}
            </Button>
          )
        }
      />
      {s ? (
        <div className="grid g2">
          <Card title={t('settings.general')}>
            <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }} className="stack">
              <Field label={t('settings.platformName')}>
                <Input value={s.platform_name} onChange={(e) => set('platform_name', e.target.value)} />
              </Field>
              <Field label={t('settings.defaultLanguage')}>
                <Select value={s.default_language} onChange={(e) => set('default_language', e.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="uz">O'zbekcha</option>
                </Select>
              </Field>
              <Field label={t('settings.defaultPassScore')}>
                <Input type="number" min={0} max={100} value={s.default_pass_score} onChange={(e) => set('default_pass_score', e.target.value)} />
              </Field>
              <div>
                <ToggleRow title={t('settings.showRating')} hint={t('settings.showRatingHint')} checked={bool('show_rating')} onChange={(v) => set('show_rating', v ? '1' : '0')} disabled={readOnly} />
              </div>
            </fieldset>
          </Card>
          <Card title={t('settings.security')}>
            <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }} className="stack">
              <div>
                <ToggleRow title={t('settings.registration')} hint={t('settings.registrationHint')} checked={bool('registration_enabled')} onChange={(v) => set('registration_enabled', v ? '1' : '0')} disabled={readOnly} />
                <ToggleRow title={t('settings.google')} checked={bool('google_auth_enabled')} onChange={(v) => set('google_auth_enabled', v ? '1' : '0')} disabled={readOnly} />
              </div>
              <Field label={t('settings.minPassword')}>
                <Input type="number" min={6} max={64} value={s.min_password_length} onChange={(e) => set('min_password_length', e.target.value)} />
              </Field>
              <Field label={t('settings.sessionDays')}>
                <Input type="number" min={1} max={90} value={s.session_days} onChange={(e) => set('session_days', e.target.value)} />
              </Field>
            </fieldset>
          </Card>
          <Periods readOnly={readOnly} />
        </div>
      ) : (
        <Loader state={state}>{() => null}</Loader>
      )}
    </>
  );
}

