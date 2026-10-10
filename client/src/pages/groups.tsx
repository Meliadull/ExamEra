import { FileSpreadsheet, Pencil, Plus, Trophy, UserMinus, UserPlus, Users, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, del, downloadUrl, patch, put, useApi } from '../api';
import { useMe } from '../auth';
import { Bars, DistributionDonut, TrendChart } from '../components/charts';
import { useSubjects } from '../components/common';
import { Avatar, Badge, Button, Card, Check, Confirm, Empty, Field, Input, Loader, Modal, PageHead, PctBadge, Select, Stat, Tabs, useAction } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

function GroupForm({ group, onClose, onDone }: { group?: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const y = new Date().getFullYear();
  const [name, setName] = useState(group?.name ?? '');
  const [year, setYear] = useState(group?.academic_year ?? `${y}–${y + 1}`);
  const [status, setStatus] = useState(group?.status ?? 'active');
  const { busy, run } = useAction();
  const submit = async () => {
    const body = { name, academicYear: year, status };
    const ok = await run(() => (group ? patch(`/groups/${group.id}`, body) : api('/groups', { body })), t('common.saved'));
    if (ok) onDone();
  };
  return (
    <Modal
      title={group ? t('groups.edit') : t('groups.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field label={t('groups.name')} hint={t('groups.nameHint')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('groups.year')}>
          <Input value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <Field label={t('common.status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">{t('groups.active')}</option>
            <option value="archived">{t('groups.archived')}</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function GroupCard({ g, onOpen }: { g: any; onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={onOpen}>
      <div className="row between">
        <div className="row">
          <div className="list-icon tone-blue">
            <Users />
          </div>
          <div>
            <h3>{g.name}</h3>
            <div className="small muted">{g.academic_year}</div>
          </div>
        </div>
        {g.status === 'archived' ? <Badge>{t('groups.archived')}</Badge> : <PctBadge value={g.avg_percentage} />}
      </div>
      {!!g.is_leader && (
        <div className="mt-sm">
          <Badge tone="green">{t('groups.leader')}</Badge>
        </div>
      )}
      <div className="small muted mt">
        {t('groups.studentsCount', { n: g.student_count })}
        {g.teachers ? ` · ${t('groups.leader')}: ${g.teachers}` : ''}
      </div>
      {g.subjects && <div className="tiny faint mt-sm ellipsis">{g.subjects}</div>}
    </div>
  );
}

export function Groups() {
  const { t } = useI18n();
  const me = useMe();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const list = useApi<any[]>('/groups', { search });
  const [creating, setCreating] = useState(false);
  return (
    <>
      <PageHead
        title={t('nav.groups')}
        subtitle={me.role === 'teacher' ? t('groups.teacherSubtitle') : t('groups.subtitle')}
        actions={
          me.role === 'admin' && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus /> {t('groups.create')}
            </Button>
          )
        }
      />
      {me.role === 'teacher' && <div className="alert info mb">{t('groups.adminManaged')}</div>}
      <div className="filters">
        <Input className="search-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Loader state={list}>
        {(items) => {
          if (!items.length) {
            return (
              <Card>
                <Empty title={t('groups.empty')} />
              </Card>
            );
          }
          // Teachers see their own class(es) first, then every other group.
          const sections =
            me.role === 'teacher'
              ? [
                  { title: t('groups.myClasses'), list: items.filter((g) => g.is_leader) },
                  { title: t('groups.otherGroups'), list: items.filter((g) => !g.is_leader) },
                ]
              : [{ title: '', list: items }];
          return sections
            .filter((sec) => sec.list.length)
            .map((sec) => (
              <section key={sec.title || 'all'} className="mb">
                {sec.title && <h2 style={{ marginBottom: 12 }}>{sec.title}</h2>}
                <div className="grid g3">
                  {sec.list.map((g) => (
                    <GroupCard key={g.id} g={g} onOpen={() => nav(`/app/groups/${g.id}`)} />
                  ))}
                </div>
              </section>
            ));
        }}
      </Loader>
      {creating && (
        <GroupForm
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function AddStudents({ groupId, existing, onClose, onDone }: { groupId: number; existing: number[]; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const users = useApi<any>('/users', { role: 'student', search, scope: 'all', pageSize: 50 });
  const [sel, setSel] = useState<number[]>([]);
  const { busy, run } = useAction();
  return (
    <Modal
      title={t('groups.addStudents')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!sel.length}
            onClick={async () => {
              const ok = await run(() => api(`/groups/${groupId}/students`, { body: { userIds: sel } }), t('groups.studentsAdded'));
              if (ok) onDone();
            }}
          >
            {t('groups.addN', { n: sel.length })}
          </Button>
        </>
      }
    >
      <Input placeholder={t('common.searchStudents')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 10 }}>
        {users.data?.items
          .filter((u: any) => !existing.includes(u.id))
          .map((u: any) => (
            <div key={u.id} style={{ padding: '7px 2px', borderBottom: '1px solid var(--border)' }}>
              <Check
                checked={sel.includes(u.id)}
                onChange={() => setSel((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))}
                label={
                  <span>
                    {u.last_name} {u.first_name} <span className="small muted">{u.phone ?? u.email} {u.groups.map((g: any) => g.name).join(', ')}</span>
                  </span>
                }
              />
            </div>
          ))}
      </div>
    </Modal>
  );
}

function ManageLinks({ group, onClose, onDone }: { group: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const teachers = useApi<any>('/users', { role: 'teacher', pageSize: 200 });
  const subjects = useSubjects();
  const [tIds, setTIds] = useState<number[]>(group.teachers.map((x: any) => x.id));
  const [sIds, setSIds] = useState<number[]>(group.subjects.map((x: any) => x.id));
  const { busy, run } = useAction();
  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  return (
    <Modal
      title={t('groups.teachersSubjects')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const ok = await run(async () => {
                await put(`/groups/${group.id}/teachers`, { userIds: tIds });
                await put(`/groups/${group.id}/subjects`, { subjectIds: sIds });
                return true;
              }, t('common.saved'));
              if (ok) onDone();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="label mb" style={{ marginBottom: 8 }}>{t('groups.teachers')}</div>
      <div className="stack" style={{ gap: 6 }}>
        {teachers.data?.items.map((u: any) => (
          <Check key={u.id} checked={tIds.includes(u.id)} onChange={() => toggle(tIds, setTIds, u.id)} label={`${u.last_name} ${u.first_name}`} />
        ))}
      </div>
      <div className="label mt" style={{ marginBottom: 8 }}>{t('nav.subjects')}</div>
      <div className="grid g2" style={{ gap: 6 }}>
        {subjects.data?.map((s) => (
          <Check key={s.id} checked={sIds.includes(s.id)} onChange={() => toggle(sIds, setSIds, s.id)} label={s.name} />
        ))}
      </div>
    </Modal>
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const f = useFormat();
  const me = useMe();
  const nav = useNavigate();
  const group = useApi<any>(`/groups/${id}`);
  const stats = useApi<any>(`/analytics/groups/${id}`);
  const [tab, setTab] = useState<'students' | 'analytics' | 'tests'>('students');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [links, setLinks] = useState(false);
  const [removing, setRemoving] = useState<any>(null);

  return (
    <Loader state={group}>
      {(g) => (
        <>
          <PageHead
            back={{ to: '/app/groups', label: t('nav.groups') }}
            title={g.name}
            subtitle={`${g.academic_year} · ${t('groups.studentsCount', { n: g.students.length })}`}
            actions={
              <>
                <Button onClick={() => downloadUrl(`/reports/group/${g.id}`, { format: 'xlsx', lang })}>
                  <FileSpreadsheet /> {t('reports.export')}
                </Button>
                {me.role === 'admin' && (
                  <>
                    <Button onClick={() => setLinks(true)}>{t('groups.teachersSubjects')}</Button>
                    <Button onClick={() => setEditing(true)}>
                      <Pencil /> {t('common.edit')}
                    </Button>
                  </>
                )}
                {g.canManage && me.role !== 'auditor' && (
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    <UserPlus /> {t('groups.addStudents')}
                  </Button>
                )}
              </>
            }
          />
          {me.role === 'teacher' && <div className={`alert ${g.isLeader ? 'success' : 'info'} mb`}>{g.isLeader ? t('groups.scopeFull') : t('groups.scopeOwn')}</div>}
          <div className="row wrap mb">
            {g.teachers.map((x: any) => (
              <Badge key={x.id} tone="purple">
                {t('groups.leader')}: {x.first_name} {x.last_name}
              </Badge>
            ))}
            {g.subjects.map((s: any) => (
              <Badge key={s.id} tone="blue">
                {s.name}
              </Badge>
            ))}
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'students', label: t('nav.students'), count: g.students.length },
              { id: 'analytics', label: t('nav.analytics') },
              { id: 'tests', label: t('nav.tests'), count: stats.data?.tests.length },
            ]}
          />
          {tab === 'students' && (
            <Card flush>
              {g.students.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('common.student')}</th>
                        <th>{t('auth.phone')}</th>
                        <th>{t('analytics.attempts')}</th>
                        <th>{t('dashboard.avgResult')}</th>
                        <th>{t('common.status')}</th>
                        {g.canManage && me.role !== 'auditor' && <th />}
                      </tr>
                    </thead>
                    <tbody>
                      {g.students.map((s: any) => (
                        <tr key={s.id} className="click" onClick={() => nav(`/app/students/${s.id}`)}>
                          <td>
                            <div className="row">
                              <Avatar name={`${s.first_name} ${s.last_name}`} url={s.avatar_url} size={32} />
                              <span className="bold">
                                {s.last_name} {s.first_name}
                              </span>
                            </div>
                          </td>
                          <td>{s.phone ?? s.email}</td>
                          <td>{s.attempts_count}</td>
                          <td>{s.avg_percentage != null ? <PctBadge value={s.avg_percentage} /> : '—'}</td>
                          <td>
                            <Badge tone={s.status === 'active' ? 'green' : 'red'}>{t(`userStatus.${s.status}`)}</Badge>
                          </td>
                          {g.canManage && me.role !== 'auditor' && (
                            <td className="right" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="icon" title={t('groups.removeStudent')} onClick={() => setRemoving(s)}>
                                <UserMinus />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={t('groups.noStudents')} />
              )}
            </Card>
          )}
          {tab === 'analytics' && (
            <Loader state={stats}>
              {(s) => (
                <div className="stack">
                  <div className="grid g4">
                    <Stat icon={<Trophy />} tone="blue" value={f.pct(s.kpis.avg_percentage)} label={t('analytics.avgPercent')} />
                    <Stat icon={<Trophy />} tone="purple" value={s.kpis.avg_score ?? '—'} label={t('analytics.avgScore')} />
                    <Stat icon={<Users />} tone="green" value={s.kpis.passed ?? 0} label={t('analytics.passed')} />
                    <Stat icon={<XCircle />} tone="red" value={s.kpis.failed ?? 0} label={t('analytics.notPassed')} />
                  </div>
                  <div className="grid g-main">
                    <Card title={t('analytics.dynamics')}>
                      <TrendChart data={s.dynamics} />
                    </Card>
                    <Card title={t('analytics.distribution')}>
                      <DistributionDonut data={s.distribution} centerLabel={t('analytics.results')} />
                    </Card>
                  </div>
                  <div className="grid g2">
                    <Card title={t('analytics.rating')}>
                      {s.rating ? (
                        s.rating.length ? (
                          s.rating.map((r: any, i: number) => (
                            <div className="list-item" key={r.id}>
                              <span className="opt-letter">{i + 1}</span>
                              <Link to={`/app/students/${r.id}`} className="grow bold" style={{ color: 'inherit' }}>
                                {r.last_name} {r.first_name}
                              </Link>
                              <span className="small muted">{t('analytics.attemptsN', { n: r.attempts })}</span>
                              <PctBadge value={r.avg_percentage} />
                            </div>
                          ))
                        ) : (
                          <Empty title={t('common.noData')} />
                        )
                      ) : (
                        <div className="alert info">{t('analytics.ratingDisabled')}</div>
                      )}
                    </Card>
                    <div className="stack">
                      <Card title={t('analytics.bySubject')}>
                        <Bars items={s.bySubject.map((x: any) => ({ label: x.name, value: x.value }))} />
                      </Card>
                      <Card title={t('analytics.hardQuestions')}>
                        {s.hardQuestions.length ? (
                          s.hardQuestions.map((q: any) => (
                            <div className="list-item" key={q.id}>
                              <div className="grow">
                                <div className="small ellipsis">{q.text}</div>
                                <div className="tiny muted">{q.test_title}</div>
                              </div>
                              <PctBadge value={q.correct_pct} />
                            </div>
                          ))
                        ) : (
                          <Empty title={t('common.noData')} />
                        )}
                      </Card>
                    </div>
                  </div>
                </div>
              )}
            </Loader>
          )}
          {tab === 'tests' && (
            <Card flush>
              <Loader state={stats}>
                {(s) =>
                  s.tests.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('common.test')}</th>
                            <th>{t('common.subject')}</th>
                            <th>{t('role.teacher')}</th>
                            <th>{t('testDetail.participants')}</th>
                            <th>{t('analytics.passed')}</th>
                            <th>{t('analytics.notPassed')}</th>
                            <th>{t('dashboard.avgResult')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.tests.map((x: any) => {
                            const canOpen = me.role !== 'teacher' || x.teacher_id === me.id;
                            return (
                              <tr key={x.id} className={canOpen ? 'click' : undefined} onClick={canOpen ? () => nav(`/app/tests/${x.id}`) : undefined}>
                                <td className="bold">{x.title}</td>
                                <td>{x.subject_name}</td>
                                <td className="small">{x.teacher_name}</td>
                                <td>{x.participants}</td>
                                <td>{x.passed}</td>
                                <td>{x.failed}</td>
                                <td>
                                  <PctBadge value={x.avg_percentage} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title={t('common.noData')} />
                  )
                }
              </Loader>
            </Card>
          )}
          {adding && (
            <AddStudents
              groupId={g.id}
              existing={g.students.map((s: any) => s.id)}
              onClose={() => setAdding(false)}
              onDone={() => {
                setAdding(false);
                group.reload();
              }}
            />
          )}
          {editing && (
            <GroupForm
              group={g}
              onClose={() => setEditing(false)}
              onDone={() => {
                setEditing(false);
                group.reload();
              }}
            />
          )}
          {links && (
            <ManageLinks
              group={g}
              onClose={() => setLinks(false)}
              onDone={() => {
                setLinks(false);
                group.reload();
              }}
            />
          )}
          {removing && (
            <Confirm
              danger
              title={t('groups.removeStudent')}
              text={t('groups.removeText', { name: `${removing.last_name} ${removing.first_name}`, group: g.name })}
              confirmLabel={t('common.remove')}
              onClose={() => setRemoving(null)}
              onConfirm={async () => {
                await del(`/groups/${g.id}/students/${removing.id}`);
                group.reload();
              }}
            />
          )}
        </>
      )}
    </Loader>
  );
}
