import { AlertTriangle, Clock, FileSpreadsheet, Mail, Phone, RotateCcw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { downloadUrl, useApi } from '../api';
import { Bars, TrendChart } from '../components/charts';
import { GroupSelect } from '../components/common';
import { Avatar, Badge, Button, Card, Empty, Input, Loader, PageHead, Pager, PctBadge, Stat, Tabs } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function Students() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi<any>('/users', { role: 'student', search, groupId, page });
  return (
    <>
      <PageHead title={t('nav.students')} subtitle={t('students.subtitle')} />
      <div className="filters">
        <Input className="search-input" placeholder={t('common.searchStudents')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <GroupSelect value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} />
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
                        <th>{t('common.student')}</th>
                        <th>{t('common.group')}</th>
                        <th>{t('auth.phone')}</th>
                        <th>{t('analytics.attempts')}</th>
                        <th>{t('dashboard.avgResult')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.items.map((s: any) => (
                        <tr key={s.id} className="click" onClick={() => nav(`/app/students/${s.id}`)}>
                          <td>
                            <div className="row">
                              <Avatar name={`${s.first_name} ${s.last_name}`} url={s.avatar_url} size={32} />
                              <span className="bold">
                                {s.last_name} {s.first_name}
                              </span>
                            </div>
                          </td>
                          <td>{s.groups.map((g: any) => g.name).join(', ') || '—'}</td>
                          <td>{s.phone ?? s.email}</td>
                          <td>{s.attempts_count}</td>
                          <td>{s.avg_percentage != null ? <PctBadge value={s.avg_percentage} /> : '—'}</td>
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

export function StudentCard() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const state = useApi<any>(`/analytics/students/${id}`);
  const [tab, setTab] = useState<'overview' | 'results'>('overview');
  return (
    <Loader state={state}>
      {(d) => {
        const s = d.student;
        return (
          <>
            <PageHead
              back={{ to: '/app/students', label: t('nav.students') }}
              title={
                <span className="row">
                  <Avatar name={`${s.first_name} ${s.last_name}`} url={s.avatar_url} size={56} />
                  <span>
                    {s.first_name} {s.last_name}
                    <div className="row wrap gap-sm" style={{ marginTop: 6 }}>
                      {d.groups.map((g: any) => (
                        <Badge key={g.id} tone="blue">
                          {g.name}
                        </Badge>
                      ))}
                      <Badge tone={s.status === 'active' ? 'green' : 'red'}>{t(`userStatus.${s.status}`)}</Badge>
                    </div>
                  </span>
                </span>
              }
              actions={
                <>
                  {s.email && (
                    <span className="row gap-sm small muted">
                      <Mail size={15} /> {s.email}
                    </span>
                  )}
                  {s.phone && (
                    <span className="row gap-sm small muted">
                      <Phone size={15} /> {s.phone}
                    </span>
                  )}
                  <Button onClick={() => downloadUrl(`/reports/student/${s.id}`, { format: 'xlsx', lang })}>
                    <FileSpreadsheet /> {t('reports.export')}
                  </Button>
                </>
              }
            />
            <div className="grid g4 mb">
              <Stat icon={<Trophy />} tone="blue" value={f.pct(d.kpis.avg_percentage)} label={t('dashboard.avgResult')} />
              <Stat icon={<RotateCcw />} tone="purple" value={`${d.kpis.attempts} / ${d.kpis.attempts_total}`} label={t('students.completedAttempts')} />
              <Stat icon={<Trophy />} tone="green" value={f.pct(d.kpis.max_percentage)} label={t('analytics.maxResult')} />
              <Stat icon={<Clock />} tone="orange" value={f.minutes(d.kpis.avg_duration_sec)} label={t('analytics.avgTime')} />
            </div>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: t('testDetail.overview') },
                { id: 'results', label: t('nav.results'), count: d.attempts.length },
              ]}
            />
            {tab === 'overview' ? (
              <div className="stack">
                <div className="grid g-main">
                  <Card title={t('analytics.dynamics')}>
                    <TrendChart data={d.dynamics} />
                  </Card>
                  <Card title={t('analytics.bySubject')}>
                    <Bars items={d.bySubject.map((x: any) => ({ label: x.name, value: x.value }))} />
                  </Card>
                </div>
                <Card title={t('students.weakTopics')}>
                  {d.weakTopics.length ? (
                    d.weakTopics.map((w: any) => (
                      <div className="list-item" key={w.topic + w.subject_name}>
                        <div className="list-icon tone-red">
                          <AlertTriangle />
                        </div>
                        <div className="grow">
                          <div className="bold">{w.topic}</div>
                          <div className="small muted">
                            {w.subject_name} · {t('analytics.attemptsN', { n: w.attempts })}
                          </div>
                        </div>
                        <PctBadge value={w.value} />
                      </div>
                    ))
                  ) : (
                    <Empty title={t('students.noWeakTopics')} />
                  )}
                </Card>
              </div>
            ) : (
              <Card flush>
                {d.attempts.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.test')}</th>
                          <th>{t('common.subject')}</th>
                          <th>{t('result.score')}</th>
                          <th>{t('common.result')}</th>
                          <th>{t('result.time')}</th>
                          <th>{t('common.date')}</th>
                          <th>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.attempts.map((a: any) => (
                          <tr key={a.id} className="click" onClick={() => nav(`/app/attempts/${a.id}/result`)}>
                            <td className="bold">{a.title}</td>
                            <td>{a.subject_name}</td>
                            <td>
                              {a.score} / {a.max_score}
                            </td>
                            <td>
                              <PctBadge value={a.percentage} />
                            </td>
                            <td>{f.duration(a.duration_sec)}</td>
                            <td className="nowrap">{f.date(a.completed_at)}</td>
                            <td>
                              <Badge tone={a.passed ? 'green' : 'red'}>{a.passed ? t('result.passed') : t('result.failed')}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title={t('student.noResults')} />
                )}
              </Card>
            )}
          </>
        );
      }}
    </Loader>
  );
}
