import { AlertTriangle, CheckCircle2, ClipboardX, FileSpreadsheet, School, Trophy, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadUrl, useApi } from '../api';
import { useMe } from '../auth';
import { Bars, DistributionDonut, TrendChart } from '../components/charts';
import { useGroups } from '../components/common';
import { Avatar, Badge, Button, Card, Empty, Loader, PageHead, PctBadge, Progress, Select, Stat, Tabs } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

interface ClassStudent {
  id: number;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  avg_percentage: number | null;
  attempts: number;
  passed: number;
  failed: number;
  missed: number;
  pending: number;
  last_completed_at: string | null;
}

/** Why a student needs the class leader's attention (empty = all good). */
function concerns(s: ClassStudent, t: (k: string, p?: Record<string, string | number>) => string): string[] {
  const out: string[] = [];
  if (s.avg_percentage != null && s.avg_percentage < 60) out.push(t('myClass.reasonLow', { n: s.avg_percentage }));
  if (s.missed > 0) out.push(t('myClass.reasonMissed', { n: s.missed }));
  if (s.failed > 0 && s.failed >= s.passed) out.push(t('myClass.reasonFailed', { n: s.failed }));
  return out;
}

/** Class leader's monitoring page for the group(s) they lead. */
export function MyClass() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const me = useMe();
  const nav = useNavigate();
  const groups = useGroups();
  const led = useMemo(() => (groups.data ?? []).filter((g: any) => g.is_leader), [groups.data]);
  const [groupId, setGroupId] = useState<number | null>(null);
  useEffect(() => {
    if (led.length && (groupId == null || !led.some((g) => g.id === groupId))) setGroupId(led[0].id);
  }, [led, groupId]);
  const data = useApi<any>(groupId ? `/analytics/class/${groupId}` : null);
  const [tab, setTab] = useState<'overview' | 'students' | 'assignments'>('overview');

  if (groups.data && !led.length) {
    return (
      <>
        <PageHead title={t('nav.myClass')} subtitle={t('myClass.subtitle')} />
        <Card>
          <Empty icon={<School />} title={t('myClass.none')} text={t('myClass.noneText')} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={t('nav.myClass')}
        subtitle={t('myClass.subtitle')}
        actions={
          <>
            {led.length > 1 && (
              <Select value={groupId ?? ''} onChange={(e) => setGroupId(Number(e.target.value))} aria-label={t('common.group')} style={{ width: 'auto' }}>
                {led.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            {groupId && (
              <Button onClick={() => downloadUrl(`/reports/group/${groupId}`, { format: 'xlsx', lang })}>
                <FileSpreadsheet /> {t('reports.export')}
              </Button>
            )}
          </>
        }
      />
      <Loader state={data}>
        {(d) => {
          const students: ClassStudent[] = d.students;
          const attention = students
            .map((s) => ({ s, why: concerns(s, t) }))
            .filter((x) => x.why.length)
            .sort((a, b) => b.why.length - a.why.length || (a.s.avg_percentage ?? 0) - (b.s.avg_percentage ?? 0));
          const missedTotal = students.reduce((sum, s) => sum + s.missed, 0);
          return (
            <>
              <div className="row wrap mb">
                <Badge tone="green">
                  {t('groups.leader')}: {d.group.name}
                </Badge>
                <span className="small muted">{d.group.academic_year}</span>
                <Link to={`/app/groups/${d.group.id}`} className="small">
                  {t('myClass.openGroup')}
                </Link>
              </div>
              <div className="grid g4 mb">
                <Stat icon={<Users />} tone="blue" value={students.length} label={t('nav.students')} />
                <Stat icon={<Trophy />} tone="purple" value={f.pct(d.kpis.avg_percentage)} label={t('dashboard.avgResult')} />
                <Stat icon={<CheckCircle2 />} tone="green" value={f.pct(d.kpis.pass_rate)} label={t('analytics.passRate')} />
                <Stat icon={<ClipboardX />} tone={missedTotal ? 'red' : 'gray'} value={missedTotal} label={t('myClass.missedTotal')} />
              </div>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { id: 'overview', label: t('testDetail.overview') },
                  { id: 'students', label: t('nav.students'), count: students.length },
                  { id: 'assignments', label: t('nav.assignments'), count: d.assignments.length },
                ]}
              />

              {tab === 'overview' && (
                <div className="stack">
                  <Card title={<h2 className="row gap-sm"><AlertTriangle size={18} color="var(--orange)" /> {t('myClass.attention')}</h2>}>
                    {attention.length ? (
                      attention.map(({ s, why }) => (
                        <div className="list-item" key={s.id}>
                          <Avatar name={`${s.first_name} ${s.last_name}`} url={s.avatar_url} size={34} />
                          <div className="grow">
                            <Link to={`/app/students/${s.id}`} className="bold" style={{ color: 'inherit' }}>
                              {s.last_name} {s.first_name}
                            </Link>
                            <div className="row wrap gap-sm mt-sm">
                              {why.map((w) => (
                                <Badge key={w} tone="orange" wrap>
                                  {w}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="alert success">
                        <CheckCircle2 /> {t('myClass.attentionEmpty')}
                      </div>
                    )}
                  </Card>
                  <div className="grid g-main">
                    <Card title={t('analytics.dynamics')}>
                      <TrendChart data={d.dynamics} />
                    </Card>
                    <Card title={t('analytics.distribution')}>
                      <DistributionDonut data={d.distribution} centerLabel={t('analytics.results')} />
                    </Card>
                  </div>
                  <Card title={t('analytics.bySubject')}>
                    <Bars items={d.bySubject.map((x: any) => ({ label: x.name, value: x.value }))} />
                  </Card>
                </div>
              )}

              {tab === 'students' && (
                <Card flush>
                  {students.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('common.student')}</th>
                            <th>{t('dashboard.avgResult')}</th>
                            <th>{t('analytics.passed')}</th>
                            <th>{t('analytics.notPassed')}</th>
                            <th>{t('myClass.missed')}</th>
                            <th>{t('myClass.pending')}</th>
                            <th>{t('myClass.lastActivity')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((s) => (
                            <tr key={s.id} className="click" onClick={() => nav(`/app/students/${s.id}`)}>
                              <td>
                                <div className="row">
                                  <Avatar name={`${s.first_name} ${s.last_name}`} url={s.avatar_url} size={32} />
                                  <span className="bold">
                                    {s.last_name} {s.first_name}
                                  </span>
                                </div>
                              </td>
                              <td>{s.avg_percentage != null ? <PctBadge value={s.avg_percentage} /> : '—'}</td>
                              <td>{s.passed}</td>
                              <td>{s.failed}</td>
                              <td>{s.missed ? <Badge tone="red">{s.missed}</Badge> : <span className="faint">0</span>}</td>
                              <td>{s.pending ? <Badge tone="blue">{s.pending}</Badge> : <span className="faint">0</span>}</td>
                              <td className="nowrap small">{f.dateTime(s.last_completed_at)}</td>
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

              {tab === 'assignments' && (
                <Card flush>
                  <p className="small muted" style={{ margin: 0, padding: '14px 20px 0' }}>
                    {t('myClass.assignmentsHint')}
                  </p>
                  {d.assignments.length ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('common.test')}</th>
                            <th>{t('role.teacher')}</th>
                            <th>{t('assign.period')}</th>
                            <th>{t('assign.progress')}</th>
                            <th>{t('dashboard.avgResult')}</th>
                            <th>{t('common.status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.assignments.map((a: any) => {
                            const own = a.teacher_id === me.id;
                            const pct = a.student_count ? (a.completed_count / a.student_count) * 100 : 0;
                            return (
                              <tr key={a.id} className={own ? 'click' : undefined} onClick={own ? () => nav(`/app/tests/${a.test_id}`) : undefined}>
                                <td>
                                  <div className="bold">{a.title}</div>
                                  <div className="tiny muted">{a.subject_name}</div>
                                </td>
                                <td className="small">{a.teacher_name}</td>
                                <td className="nowrap small">
                                  {f.date(a.starts_at)} — {f.date(a.ends_at)}
                                </td>
                                <td style={{ minWidth: 140 }}>
                                  <div className="small mb" style={{ marginBottom: 4 }}>
                                    {t('myClass.completedOf', { done: a.completed_count, total: a.student_count })}
                                  </div>
                                  <Progress value={pct} color={pct === 100 ? 'var(--green)' : undefined} />
                                </td>
                                <td>{a.avg_percentage != null ? <PctBadge value={a.avg_percentage} /> : '—'}</td>
                                <td>
                                  <Badge tone={a.state === 'active' ? 'blue' : a.state === 'upcoming' ? 'orange' : 'gray'}>{t(`assign.state.${a.state}`)}</Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty title={t('assign.empty')} />
                  )}
                </Card>
              )}
            </>
          );
        }}
      </Loader>
    </>
  );
}
