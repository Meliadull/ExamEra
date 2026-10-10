import { Activity, AlertTriangle, Ban, CheckCircle2, FileText, GraduationCap, Info, KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserCog, Users as UsersIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, del, patch, put, useApi } from '../api';
import { useMe } from '../auth';
import { auditActionLabel, useGroups, useSubjects } from '../components/common';
import { Avatar, Badge, Button, Card, Check, Confirm, Empty, ErrorBox, Field, Input, Loader, Modal, PageHead, Pager, Select, Stat, ToggleRow, useAction } from '../components/ui';
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

function UserForm({ u, onClose, onDone }: { u?: any; onClose: () => void; onDone: (temp?: string) => void }) {
  const { t } = useI18n();
  const groups = useGroups();
  const subjects = useSubjects();
  const [subjectIds, setSubjectIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    firstName: u?.first_name ?? '',
    lastName: u?.last_name ?? '',
    phone: u?.phone ?? '',
    email: u?.email ?? '',
    role: (u?.role ?? 'student') as Role,
    password: '',
  });
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [err, setErr] = useState<unknown>(null);
  const { busy, run } = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    setErr(null);
    try {
      if (u) {
        await patch(`/users/${u.id}`, { firstName: form.firstName, lastName: form.lastName, phone: form.phone || null, email: form.email || null });
        onDone();
      } else {
        const r = await api('/users', { body: { ...form, phone: form.phone || null, email: form.email || null, groupIds, subjectIds: form.role === 'teacher' ? subjectIds : [] } });
        onDone(r.tempPassword);
      }
    } catch (e) {
      setErr(e);
    }
  };
  return (
    <Modal
      wide
      title={u ? t('users.edit') : t('users.create')}
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
        {!u && (
          <>
            <Field label={t('users.role')}>
              <Select value={form.role} onChange={set('role')}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('auth.password')} hint={t('users.passwordHint')}>
              <Input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
            </Field>
            {form.role === 'teacher' && (
              <Field label={t('users.subjectsTaught')} className="full">
                <div className="row wrap">
                  {subjects.data?.map((s) => (
                    <Check key={s.id} checked={subjectIds.includes(s.id)} onChange={() => setSubjectIds((x) => (x.includes(s.id) ? x.filter((v) => v !== s.id) : [...x, s.id]))} label={s.name} />
                  ))}
                </div>
              </Field>
            )}
            {(form.role === 'student' || form.role === 'teacher') && (
              <Field label={form.role === 'teacher' ? t('users.groupsLed') : t('nav.groups')} className="full">
                <div className="row wrap">
                  {groups.data?.map((g) => (
                    <Check key={g.id} checked={groupIds.includes(g.id)} onChange={() => setGroupIds((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))} label={g.name} />
                  ))}
                </div>
              </Field>
            )}
          </>
        )}
      </div>
      {!!err && (
        <div className="mt">
          <ErrorBox error={err} />
        </div>
      )}
    </Modal>
  );
}

export function Users() {
  const { t } = useI18n();
  const f = useFormat();
  const me = useMe();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi<any>('/users', { search, role, status, page });
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  return (
    <>
      <PageHead
        title={t('nav.users')}
        subtitle={t('users.subtitle')}
        actions={
          me.role === 'admin' && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> {t('users.create')}
            </Button>
          )
        }
      />
      <div className="filters">
        <Input className="search-input" placeholder={t('users.search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">{t('audit.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">{t('users.anyStatus')}</option>
          {['active', 'blocked', 'archived'].map((s) => (
            <option key={s} value={s}>
              {t(`userStatus.${s}`)}
            </option>
          ))}
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
                        <th>{t('users.role')}</th>
                        <th>{t('auth.phone')}</th>
                        <th>Email</th>
                        <th>{t('common.group')}</th>
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
                              <span className="bold">
                                {u.last_name} {u.first_name}
                              </span>
                            </div>
                          </td>
                          <td>
                            <Badge tone={ROLE_TONE[u.role as Role]}>{t(`role.${u.role}`)}</Badge>
                          </td>
                          <td className="nowrap">{u.phone ?? '—'}</td>
                          <td>{u.email ?? '—'}</td>
                          <td>{u.groups.map((g: any) => g.name).join(', ') || '—'}</td>
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
      {creating && (
        <UserForm
          onClose={() => setCreating(false)}
          onDone={(tp) => {
            setCreating(false);
            list.reload();
            if (tp) setTemp(tp);
          }}
        />
      )}
      {temp && <TempPassword value={temp} onClose={() => setTemp(null)} />}
    </>
  );
}

/** Admin-only: which subjects a teacher teaches and which groups they lead. */
function TeachingCard({ teacher, readOnly, onSaved }: { teacher: any; readOnly: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const subjects = useSubjects();
  const groups = useGroups();
  const [sIds, setSIds] = useState<number[]>(teacher.subjects.map((s: any) => s.id));
  const [gIds, setGIds] = useState<number[]>(teacher.groups.filter((g: any) => g.relation === 'teacher').map((g: any) => g.id));
  const { busy, run } = useAction();
  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id]);
  return (
    <Card title={t('users.teaching')} className="mt">
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('users.teachingHint')}
      </p>
      <div className="grid g2">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            {t('users.subjectsTaught')}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {subjects.data?.map((s) => (
              <Check key={s.id} disabled={readOnly} checked={sIds.includes(s.id)} onChange={() => toggle(sIds, setSIds, s.id)} label={s.name} />
            ))}
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            {t('users.groupsLed')}
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {groups.data?.map((g) => (
              <Check
                key={g.id}
                disabled={readOnly}
                checked={gIds.includes(g.id)}
                onChange={() => toggle(gIds, setGIds, g.id)}
                label={
                  <span>
                    {g.name} <span className="small muted">{g.academic_year}</span>
                  </span>
                }
              />
            ))}
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="row mt" style={{ justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const ok = await run(() => put(`/users/${teacher.id}/teaching`, { subjectIds: sIds, groupIds: gIds }), t('common.saved'));
              if (ok) onSaved();
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      )}
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
  const [confirm, setConfirm] = useState<null | { kind: 'status'; status: string } | { kind: 'reset' } | { kind: 'role'; role: Role }>(null);
  const [newRole, setNewRole] = useState<Role | ''>('');
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
            <Card title={t('users.role')}>
              {isAdmin && !self ? (
                <div className="stack" style={{ gap: 12 }}>
                  <Select value={newRole || x.role} onChange={(e) => setNewRole(e.target.value as Role)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </Select>
                  <Button variant="primary" disabled={!newRole || newRole === x.role} onClick={() => newRole && setConfirm({ kind: 'role', role: newRole })}>
                    {t('users.changeRole')}
                  </Button>
                  <div className="small muted">{t('users.roleHint')}</div>
                </div>
              ) : (
                <div className="muted">{t(`role.${x.role}`)}</div>
              )}
            </Card>
          </div>
          {x.role === 'teacher' && (
            <TeachingCard
              key={x.id + ':' + x.subjects.map((s: any) => s.id).join(',')}
              teacher={x}
              readOnly={!isAdmin}
              onSaved={() => {
                u.reload();
                activity.reload();
              }}
            />
          )}
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
              title={
                confirm.kind === 'reset'
                  ? t('users.resetAccess')
                  : confirm.kind === 'role'
                    ? t('users.changeRole')
                    : t(`users.statusTitle.${confirm.status}`)
              }
              text={
                confirm.kind === 'reset'
                  ? t('users.resetText')
                  : confirm.kind === 'role'
                    ? t('users.roleText', { role: t(`role.${confirm.role}`) })
                    : t(`users.statusText.${confirm.status}`)
              }
              onClose={() => setConfirm(null)}
              onConfirm={async () => {
                if (confirm.kind === 'reset') {
                  const r = await api(`/users/${x.id}/reset-password`, { method: 'POST' });
                  setTemp(r.tempPassword);
                } else if (confirm.kind === 'role') {
                  await patch(`/users/${x.id}/role`, { role: confirm.role });
                  setNewRole('');
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
  const counts = useApi<any>('/analytics/admin');
  const tone = { yes: 'green', no: 'gray', limited: 'orange', optional: 'blue', na: 'gray' } as const;
  return (
    <>
      <PageHead title={t('nav.roles')} subtitle={t('roles.subtitle')} />
      <div className="grid g4 mb">
        {ROLES.map((r) => (
          <Card key={r}>
            <Badge tone={ROLE_TONE[r]}>{t(`role.${r}`)}</Badge>
            <div className="stat-value mt-sm">{counts.data?.users?.[`${r}s`] ?? '—'}</div>
            <div className="small muted">{t(`roles.desc.${r}`)}</div>
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

