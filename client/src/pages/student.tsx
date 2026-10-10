import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, FileText, Play, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { useMe } from '../auth';
import { TrendChart } from '../components/charts';
import { Badge, Button, Card, Empty, ErrorBox, Loader, Modal, PageHead, PctBadge, Stat, Tabs, type Tone } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export interface MyAssignment {
  id: number;
  test_id: number;
  title: string;
  topic: string;
  description: string;
  instruction: string;
  subject_name: string;
  group_name: string | null;
  starts_at: string;
  ends_at: string;
  duration_min: number | null;
  attempts_limit: number;
  attempts_used: number;
  attempts_completed: number;
  active_attempt_id: number | null;
  last_attempt_id: number | null;
  best_percentage: number | null;
  question_count: number;
  show_result: number;
  status: 'available' | 'scheduled' | 'completed' | 'overdue';
}

const STATUS_TONE: Record<MyAssignment['status'], Tone> = { available: 'blue', scheduled: 'orange', completed: 'green', overdue: 'red' };

export function StartTestModal({ a, onClose }: { a: MyAssignment; onClose: () => void }) {
  const { t } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const start = async () => {
    setBusy(true);
    try {
      const r = await api('/attempts', { body: { assignmentId: a.id } });
      nav(`/app/attempt/${r.id}`);
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={a.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={start} loading={busy}>
            <Play /> {a.active_attempt_id ? t('student.continue') : t('student.startNow')}
          </Button>
        </>
      }
    >
      <dl className="kv">
        <dt>{t('common.subject')}</dt>
        <dd>{a.subject_name}</dd>
        <dt>{t('common.questions')}</dt>
        <dd>{a.question_count}</dd>
        <dt>{t('common.duration')}</dt>
        <dd>{a.duration_min ? t('common.minutes', { n: a.duration_min }) : t('common.unlimited')}</dd>
        <dt>{t('student.attempts')}</dt>
        <dd>
          {a.attempts_used} / {a.attempts_limit}
        </dd>
        <dt>{t('student.deadline')}</dt>
        <dd>{f.dateTime(a.ends_at)}</dd>
      </dl>
      {a.instruction && <div className="alert info mt pre">{a.instruction}</div>}
      {!a.active_attempt_id && a.duration_min && <div className="alert warning mt">{t('student.timerWarning')}</div>}
      {!!err && (
        <div className="mt">
          <ErrorBox error={err} />
        </div>
      )}
    </Modal>
  );
}

export function AssignmentCard({ a, onStart }: { a: MyAssignment; onStart: (a: MyAssignment) => void }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <div className="card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="row gap-sm wrap">
            <Badge tone={STATUS_TONE[a.status]}>{t(`student.status.${a.status}`)}</Badge>
            {a.active_attempt_id && <Badge tone="purple">{t('student.inProgress')}</Badge>}
          </div>
          <h3 style={{ marginTop: 10 }}>{a.title}</h3>
          <div className="small muted">
            {a.subject_name}
            {a.topic ? ` · ${a.topic}` : ''}
          </div>
        </div>
        {a.best_percentage != null && <PctBadge value={a.best_percentage} />}
      </div>
      <div className="grid g2 small mt" style={{ gap: 8 }}>
        <div className="row gap-sm muted">
          <CalendarClock size={15} />
          {a.status === 'scheduled' ? t('student.opens', { date: f.dateTime(a.starts_at) }) : t('student.until', { date: f.dateTime(a.ends_at) })}
        </div>
        <div className="row gap-sm muted">
          <AlarmClock size={15} />
          {a.duration_min ? t('common.minutes', { n: a.duration_min }) : t('common.unlimited')}
        </div>
        <div className="row gap-sm muted">
          <FileText size={15} />
          {t('student.questionsCount', { n: a.question_count })}
        </div>
        <div className="row gap-sm muted">
          <RotateCcw size={15} />
          {t('student.attemptsLeft', { used: a.attempts_used, limit: a.attempts_limit })}
        </div>
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        {a.last_attempt_id && (
          <Link to={`/app/attempts/${a.last_attempt_id}/result`} className="btn sm">
            {t('student.viewResult')}
          </Link>
        )}
        {a.status === 'available' && (
          <Button size="sm" variant="primary" onClick={() => onStart(a)}>
            <Play /> {a.active_attempt_id ? t('student.continue') : a.attempts_completed ? t('student.retry') : t('student.start')}
          </Button>
        )}
      </div>
    </div>
  );
}

export function StudentDashboard() {
  const me = useMe();
  const { t } = useI18n();
  const f = useFormat();
  const state = useApi('/student/dashboard');
  const [starting, setStarting] = useState<MyAssignment | null>(null);
  return (
    <>
      <PageHead title={t('dashboard.hello', { name: me.first_name })} subtitle={t('student.dashSubtitle')} />
      {me.requested_role === 'teacher' && <div className="alert warning mb">{t('student.teacherRequestPending')}</div>}
      <Loader state={state}>
        {(d: any) => (
          <div className="stack">
            <div className="grid g4">
              <Stat icon={<ClipboardList />} tone="blue" value={d.counts.available} label={t('student.status.available')} />
              <Stat icon={<CalendarClock />} tone="orange" value={d.counts.scheduled} label={t('student.status.scheduled')} />
              <Stat icon={<CheckCircle2 />} tone="green" value={d.counts.completed} label={t('student.status.completed')} />
              <Stat icon={<Trophy />} tone="purple" value={f.pct(d.stats?.avg_percentage)} label={t('dashboard.avgResult')} />
            </div>
            <div className="grid g-main">
              <Card title={t('student.myTests')} action={<Link to="/app/my-tests">{t('common.viewAll')}</Link>}>
                {d.upcoming.length ? (
                  <div className="stack" style={{ gap: 0 }}>
                    {d.upcoming.map((a: MyAssignment) => (
                      <div className="list-item" key={a.id}>
                        <div className={`list-icon tone-${a.status === 'available' ? 'blue' : 'orange'}`}>
                          <FileText />
                        </div>
                        <div className="grow">
                          <div className="bold ellipsis">{a.title}</div>
                          <div className="small muted">
                            {a.subject_name} ·{' '}
                            {a.status === 'scheduled' ? t('student.opens', { date: f.dateTime(a.starts_at) }) : t('student.until', { date: f.dateTime(a.ends_at) })}
                          </div>
                        </div>
                        {a.status === 'available' ? (
                          <Button size="sm" variant="primary" onClick={() => setStarting(a)}>
                            {a.active_attempt_id ? t('student.continue') : a.attempts_completed ? t('student.retry') : t('student.start')}
                          </Button>
                        ) : (
                          <Badge tone="orange">{t('student.status.scheduled')}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title={t('student.noUpcoming')} />
                )}
              </Card>
              <Card title={t('student.recentResults')} action={<Link to="/app/results">{t('common.viewAll')}</Link>}>
                {d.recent.length ? (
                  d.recent.map((r: any) => (
                    <Link to={`/app/attempts/${r.id}/result`} className="list-item" key={r.id} style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="grow">
                        <div className="bold ellipsis">{r.title}</div>
                        <div className="small muted">
                          {r.subject_name} · {f.date(r.completed_at)}
                        </div>
                      </div>
                      {r.show_result ? <PctBadge value={r.percentage} /> : <Badge>{t('student.resultHidden')}</Badge>}
                    </Link>
                  ))
                ) : (
                  <Empty title={t('student.noResults')} />
                )}
              </Card>
            </div>
            <Card title={t('student.progress')}>
              <TrendChart data={d.dynamics} />
            </Card>
          </div>
        )}
      </Loader>
      {starting && <StartTestModal a={starting} onClose={() => setStarting(null)} />}
    </>
  );
}

export function MyTests() {
  const { t } = useI18n();
  const state = useApi<MyAssignment[]>('/student/tests');
  const [tab, setTab] = useState<MyAssignment['status']>('available');
  const [starting, setStarting] = useState<MyAssignment | null>(null);
  return (
    <>
      <PageHead title={t('student.myTests')} subtitle={t('student.myTestsSubtitle')} />
      <Loader state={state}>
        {(list) => {
          const count = (s: string) => list.filter((a) => a.status === s).length;
          const shown = list.filter((a) => a.status === tab);
          return (
            <>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={(['available', 'scheduled', 'completed', 'overdue'] as const).map((s) => ({ id: s, label: t(`student.tab.${s}`), count: count(s) }))}
              />
              {shown.length ? (
                <div className="grid g2">
                  {shown.map((a) => (
                    <AssignmentCard key={a.id} a={a} onStart={setStarting} />
                  ))}
                </div>
              ) : (
                <Empty title={t('student.emptyTab')} />
              )}
            </>
          );
        }}
      </Loader>
      {starting && <StartTestModal a={starting} onClose={() => setStarting(null)} />}
    </>
  );
}

interface MyAttempt {
  id: number;
  status: string;
  title: string;
  subject_name: string;
  started_at: string;
  completed_at: string | null;
  duration_sec: number | null;
  score: number | null;
  max_score: number | null;
  percentage: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  passed: number | null;
  finish_reason: string | null;
  show_result: number;
}

export function MyResults() {
  const { t } = useI18n();
  const f = useFormat();
  const state = useApi<MyAttempt[]>('/student/attempts');
  return (
    <>
      <PageHead title={t('nav.results')} subtitle={t('student.resultsSubtitle')} />
      <Loader state={state}>
        {(list) => {
          const done = list.filter((a) => a.status === 'completed');
          const visible = done.filter((a) => a.show_result && a.percentage != null);
          const avg = visible.length ? visible.reduce((s, a) => s + (a.percentage ?? 0), 0) / visible.length : null;
          return (
            <div className="stack">
              <div className="grid g3">
                <Stat icon={<CheckCircle2 />} tone="green" value={done.length} label={t('student.testsDone')} />
                <Stat icon={<Trophy />} tone="blue" value={f.pct(avg)} label={t('dashboard.avgResult')} />
                <Stat icon={<XCircle />} tone="red" value={visible.filter((a) => !a.passed).length} label={t('student.notPassed')} />
              </div>
              {done.length ? (
                <div className="grid g2">
                  {done.map((a) => (
                    <Link key={a.id} to={`/app/attempts/${a.id}/result`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="row between">
                        <div className="grow">
                          <h3 className="ellipsis">{a.title}</h3>
                          <div className="small muted">
                            {a.subject_name} · {f.dateTime(a.completed_at)}
                          </div>
                        </div>
                        {a.show_result ? <PctBadge value={a.percentage} /> : <Badge>{t('student.resultHidden')}</Badge>}
                      </div>
                      {a.show_result ? (
                        <div className="row wrap small muted mt" style={{ gap: 16 }}>
                          <span>
                            {t('result.score')}: <b className="bold" style={{ color: 'var(--text)' }}>{a.score} / {a.max_score}</b>
                          </span>
                          <span>{t('result.correct')}: {a.correct_count}</span>
                          <span>{t('result.time')}: {f.duration(a.duration_sec)}</span>
                          <Badge tone={a.passed ? 'green' : 'red'}>{a.passed ? t('result.passed') : t('result.failed')}</Badge>
                        </div>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <Empty title={t('student.noResults')} action={<Link to="/app/my-tests" className="btn primary">{t('student.myTests')}</Link>} />
                </Card>
              )}
            </div>
          );
        }}
      </Loader>
    </>
  );
}

export function History() {
  const { t } = useI18n();
  const f = useFormat();
  const state = useApi<MyAttempt[]>('/student/attempts');
  return (
    <>
      <PageHead title={t('nav.history')} subtitle={t('student.historySubtitle')} />
      <Loader state={state}>
        {(list) =>
          list.length ? (
            <Card flush>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.test')}</th>
                      <th>{t('common.subject')}</th>
                      <th>{t('history.started')}</th>
                      <th>{t('history.finished')}</th>
                      <th>{t('result.time')}</th>
                      <th>{t('result.score')}</th>
                      <th>{t('common.result')}</th>
                      <th>{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td className="bold">
                          {a.status === 'completed' ? <Link to={`/app/attempts/${a.id}/result`}>{a.title}</Link> : <Link to={`/app/attempt/${a.id}`}>{a.title}</Link>}
                        </td>
                        <td>{a.subject_name}</td>
                        <td className="nowrap">{f.dateTime(a.started_at)}</td>
                        <td className="nowrap">{f.dateTime(a.completed_at)}</td>
                        <td>{f.duration(a.duration_sec)}</td>
                        <td>{a.score != null ? `${a.score} / ${a.max_score}` : '—'}</td>
                        <td>{a.show_result ? <PctBadge value={a.percentage} /> : <Badge>{t('student.resultHidden')}</Badge>}</td>
                        <td>
                          {a.status === 'in_progress' ? (
                            <Badge tone="purple">{t('student.inProgress')}</Badge>
                          ) : (
                            <Badge tone="gray">{t(`finish.${a.finish_reason ?? 'manual'}`)}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card>
              <Empty title={t('student.noResults')} />
            </Card>
          )
        }
      </Loader>
    </>
  );
}
