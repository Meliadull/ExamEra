import { Archive, CalendarPlus, CheckCircle2, Clock, Copy, Download, FileSpreadsheet, FileText, MoreVertical, Pencil, Plus, Send, Trash2, Trophy, Upload, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, del, downloadUrl, useApi } from '../api';
import { useMe } from '../auth';
import { Bars, DistributionDonut } from '../components/charts';
import { distinct, matchesSearch, OptionText, ResetFilters, SubjectSelect, TeacherSelect, TestStatusBadge, ValueSelect } from '../components/common';
import { RichText } from '../components/RichText';
import { Badge, Button, Card, Confirm, Empty, Input, Loader, PageHead, PctBadge, Progress, Select, Stat, Tabs, useAction } from '../components/ui';
import { useFormat, useI18n } from '../i18n';
import type { TestStatus } from '../types';
import { AssignModal, AssignmentsTable } from './Assignments';
import { ImportModal } from './TestBuilder';

function RowMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <div className="rel" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="menu">
        <MoreVertical />
      </button>
      {open && (
        <div className="dropdown">
          {visible.map((i) => (
            <button
              key={i.label}
              onClick={() => {
                setOpen(false);
                i.onClick();
              }}
              style={i.danger ? { color: 'var(--red)' } : undefined}
            >
              {i.icon} {i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function useTestActions(reload: () => void) {
  const { t } = useI18n();
  const nav = useNavigate();
  const { run } = useAction();
  return {
    setStatus: (id: number, status: TestStatus) =>
      run(() => api(`/tests/${id}/status`, { body: { status } }), t(`tests.statusChanged.${status}`)).then((r) => r && reload()),
    copy: (id: number) =>
      run(() => api(`/tests/${id}/copy`, { method: 'POST' }), t('tests.copied')).then((r) => r && nav(`/app/tests/${r.id}/edit`)),
  };
}

export function TestsList() {
  const { t } = useI18n();
  const f = useFormat();
  const me = useMe();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [status, setStatus] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const list = useApi<any[]>('/tests', { search, subjectId, status, teacherId });
  const actions = useTestActions(list.reload);
  const [deleting, setDeleting] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const canEdit = me.role === 'teacher' || me.role === 'admin';

  return (
    <>
      <PageHead
        title={t('nav.tests')}
        subtitle={t('tests.subtitle')}
        actions={
          canEdit && (
            <>
              <Button onClick={() => setImporting(true)}>
                <Upload /> {t('tests.importXlsx')}
              </Button>
              <Link to="/app/tests/new" className="btn primary">
                <Plus size={17} /> {t('tests.create')}
              </Link>
            </>
          )
        }
      />
      <div className="filters">
        <Input className="search-input" placeholder={t('tests.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('tests.allStatuses')}</option>
          {(['draft', 'published', 'completed', 'archived'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`testStatus.${s}`)}
            </option>
          ))}
        </Select>
        {me.role !== 'teacher' && <TeacherSelect value={teacherId} onChange={setTeacherId} />}
        <ResetFilters
          active={!!(search || subjectId || status || teacherId)}
          onReset={() => {
            setSearch('');
            setSubjectId('');
            setStatus('');
            setTeacherId('');
          }}
        />
      </div>
      <Card flush>
        <Loader state={list}>
          {(items) =>
            items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.title')}</th>
                      <th>{t('common.subject')}</th>
                      <th>{t('common.questions')}</th>
                      <th>{t('nav.students')}</th>
                      <th>{t('dashboard.avgResult')}</th>
                      <th>{t('common.date')}</th>
                      <th>{t('common.status')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id} className="click" onClick={() => nav(`/app/tests/${x.id}`)}>
                        <td>
                          <div className="bold">{x.title}</div>
                          <div className="tiny muted">
                            {x.topic}
                            {me.role !== 'teacher' ? ` · ${x.teacher_name}` : ''}
                          </div>
                        </td>
                        <td>{x.subject_name}</td>
                        <td>{x.question_count}</td>
                        <td>{x.participants}</td>
                        <td>{x.avg_percentage != null ? <PctBadge value={x.avg_percentage} /> : '—'}</td>
                        <td className="nowrap">{f.date(x.updated_at)}</td>
                        <td>
                          <TestStatusBadge status={x.status} />
                        </td>
                        <td className="right">
                          <RowMenu
                            items={[
                              { label: t('common.edit'), icon: <Pencil />, onClick: () => nav(`/app/tests/${x.id}/edit`), hidden: !canEdit || x.status === 'archived' },
                              { label: t('tests.publish'), icon: <Send />, onClick: () => actions.setStatus(x.id, 'published'), hidden: !canEdit || x.status !== 'draft' },
                              { label: t('tests.copy'), icon: <Copy />, onClick: () => actions.copy(x.id), hidden: !canEdit },
                              { label: t('tests.archive'), icon: <Archive />, onClick: () => actions.setStatus(x.id, 'archived'), hidden: !canEdit || x.status === 'archived' },
                              { label: t('tests.restore'), icon: <FileText />, onClick: () => actions.setStatus(x.id, 'draft'), hidden: !canEdit || x.status !== 'archived' },
                              { label: t('common.delete'), icon: <Trash2 />, danger: true, onClick: () => setDeleting(x), hidden: !canEdit || x.status !== 'draft' || x.assignment_count > 0 },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={t('tests.empty')} action={canEdit && <Link to="/app/tests/new" className="btn primary">{t('tests.create')}</Link>} />
            )
          }
        </Loader>
      </Card>
      {deleting && (
        <Confirm
          danger
          title={t('tests.deleteTitle')}
          text={t('tests.deleteText', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await del(`/tests/${deleting.id}`);
            list.reload();
          }}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </>
  );
}

function QuestionAnalysis({ questions }: { questions: any[] }) {
  const { t } = useI18n();
  const [sort, setSort] = useState<'position' | 'hard'>('position');
  const list = [...questions].sort((a, b) => (sort === 'hard' ? a.correct_pct - b.correct_pct : a.position - b.position));
  return (
    <div className="stack">
      <div className="row between">
        <span className="muted small">{t('analysis.hint')}</span>
        <Select className="sm" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as 'position' | 'hard')}>
          <option value="position">{t('analysis.sortOrder')}</option>
          <option value="hard">{t('analysis.sortHard')}</option>
        </Select>
      </div>
      {list.map((q) => (
        <Card key={q.id}>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div className="small muted">
                {t('result.questionN', { n: q.position })} · {t(`qtype.${q.type}`)}
              </div>
              <RichText text={q.text} className="bold" />
            </div>
            <PctBadge value={q.correct_pct} />
          </div>
          <div className="grid g3 mt" style={{ gap: 10 }}>
            <div>
              <div className="small muted">{t('analysis.correct')}</div>
              <div className="bold" style={{ color: 'var(--green)' }}>
                {q.correct_pct}% <span className="small muted">({q.correct})</span>
              </div>
            </div>
            <div>
              <div className="small muted">{t('analysis.wrong')}</div>
              <div className="bold" style={{ color: 'var(--red)' }}>
                {q.wrong_pct}% <span className="small muted">({q.wrong})</span>
              </div>
            </div>
            <div>
              <div className="small muted">{t('analysis.skipped')}</div>
              <div className="bold">
                {q.skipped_pct}% <span className="small muted">({q.skipped})</span>
              </div>
            </div>
          </div>
          {q.options.length > 0 && (
            <div className="mt">
              {q.options.map((o: any) => {
                const total = q.correct + q.wrong + q.skipped || 1;
                const pct = Math.round((o.count / total) * 100);
                return (
                  <div key={o.id} className="bar-row" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) 70px' }}>
                    <span className="ellipsis">
                      {o.is_correct ? '✓ ' : ''}
                      <OptionText type={q.type} text={o.text} />
                    </span>
                    <Progress value={pct} color={o.is_correct ? 'var(--green)' : '#94a3b8'} />
                    <span className="right small">
                      {o.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {q.text_answers.length > 0 && (
            <div className="chip-list mt">
              {q.text_answers.map((a: any) => (
                <span className="chip" key={a.text}>
                  {a.text} · {a.count}
                </span>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export function TestDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const f = useFormat();
  const me = useMe();
  const nav = useNavigate();
  const test = useApi<any>(`/tests/${id}`);
  const stats = useApi<any>(`/analytics/tests/${id}`);
  const assignments = useApi<any[]>('/assignments', { testId: id });
  const [tab, setTab] = useState<'overview' | 'participants' | 'questions' | 'assignments' | 'content'>('overview');
  const [assigning, setAssigning] = useState(false);
  const reloadAll = () => {
    test.reload();
    stats.reload();
    assignments.reload();
  };
  const actions = useTestActions(reloadAll);

  return (
    <Loader state={test}>
      {(x) => {
        const canEdit = x.can_edit && me.role !== 'auditor';
        return (
          <>
            <PageHead
              back={{ to: '/app/tests', label: t('nav.tests') }}
              title={
                <span className="row wrap">
                  {x.title} <TestStatusBadge status={x.status} />
                </span>
              }
              subtitle={`${x.subject_name}${x.topic ? ` · ${x.topic}` : ''} · ${x.teacher_name}`}
              actions={
                <>
                  <Button onClick={() => downloadUrl(`/reports/test/${x.id}`, { format: 'xlsx', lang })}>
                    <FileSpreadsheet /> XLSX
                  </Button>
                  <Button onClick={() => downloadUrl(`/reports/test/${x.id}`, { format: 'csv', lang })}>
                    <Download /> CSV
                  </Button>
                  {canEdit && x.status !== 'archived' && (
                    <Button onClick={() => nav(`/app/tests/${x.id}/edit`)}>
                      <Pencil /> {t('common.edit')}
                    </Button>
                  )}
                  {canEdit && <Button onClick={() => actions.copy(x.id)}><Copy /> {t('tests.copy')}</Button>}
                  {canEdit && x.status === 'draft' && (
                    <Button variant="primary" onClick={() => actions.setStatus(x.id, 'published')}>
                      <Send /> {t('tests.publish')}
                    </Button>
                  )}
                  {canEdit && x.status === 'published' && (
                    <>
                      <Button onClick={() => actions.setStatus(x.id, 'completed')}>
                        <CheckCircle2 /> {t('tests.complete')}
                      </Button>
                      <Button variant="primary" onClick={() => setAssigning(true)}>
                        <CalendarPlus /> {t('tests.assign')}
                      </Button>
                    </>
                  )}
                  {canEdit && x.status === 'completed' && <Button onClick={() => actions.setStatus(x.id, 'published')}>{t('tests.reopen')}</Button>}
                  {canEdit && x.status !== 'archived' && x.status !== 'draft' && (
                    <Button variant="ghost" onClick={() => actions.setStatus(x.id, 'archived')}>
                      <Archive /> {t('tests.archive')}
                    </Button>
                  )}
                </>
              }
            />
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: t('testDetail.overview') },
                { id: 'participants', label: t('testDetail.participants'), count: stats.data?.attempts.length },
                { id: 'questions', label: t('testDetail.questionAnalysis') },
                { id: 'assignments', label: t('nav.assignments'), count: assignments.data?.length },
                { id: 'content', label: t('testDetail.content'), count: x.questions.length },
              ]}
            />
            {tab === 'overview' && (
              <Loader state={stats}>
                {(s) => (
                  <div className="stack">
                    <div className="grid g4">
                      <Stat icon={<Trophy />} tone="blue" value={f.pct(s.kpis.avg_percentage)} label={t('analytics.groupAvg')} />
                      <Stat icon={<Users />} tone="purple" value={`${s.kpis.completed_students} / ${s.kpis.assigned}`} label={t('testDetail.completedOfAssigned')} />
                      <Stat icon={<XCircle />} tone="red" value={s.kpis.failed ?? 0} label={t('analytics.notPassed')} />
                      <Stat icon={<Clock />} tone="orange" value={f.minutes(s.kpis.avg_duration_sec)} label={t('analytics.avgTime')} />
                    </div>
                    <div className="grid g3">
                      <Card title={t('analytics.distribution')}>
                        <DistributionDonut data={s.distribution} centerLabel={t('analytics.results')} />
                      </Card>
                      <Card title={t('testDetail.summary')}>
                        <dl className="kv">
                          <dt>{t('analytics.maxResult')}</dt>
                          <dd>{f.pct(s.kpis.max_percentage)}</dd>
                          <dt>{t('analytics.minResult')}</dt>
                          <dd>{f.pct(s.kpis.min_percentage)}</dd>
                          <dt>{t('analytics.avgScore')}</dt>
                          <dd>{s.kpis.avg_score ?? '—'}</dd>
                          <dt>{t('analytics.passed')}</dt>
                          <dd>{s.kpis.passed ?? 0}</dd>
                          <dt>{t('analytics.passRate')}</dt>
                          <dd>{f.pct(s.kpis.pass_rate)}</dd>
                          <dt>{t('analytics.attempts')}</dt>
                          <dd>{s.kpis.attempts}</dd>
                        </dl>
                      </Card>
                      <Card title={t('analytics.byGroup')}>
                        <Bars items={s.byGroup.map((g: any) => ({ label: g.name, value: g.value }))} />
                      </Card>
                    </div>
                    <Card title={t('analytics.hardQuestions')}>
                      {s.questions.length ? (
                        <Bars
                          items={[...s.questions]
                            .sort((a: any, b: any) => a.correct_pct - b.correct_pct)
                            .slice(0, 6)
                            .map((q: any) => ({ label: `№${q.position}`, value: q.correct_pct }))}
                        />
                      ) : (
                        <Empty title={t('common.noData')} />
                      )}
                    </Card>
                  </div>
                )}
              </Loader>
            )}
            {tab === 'participants' && <Loader state={stats}>{(s) => <Participants attempts={s.attempts} />}</Loader>}
            {tab === 'questions' && <Loader state={stats}>{(s) => (s.attempts.length ? <QuestionAnalysis questions={s.questions} /> : <Card><Empty title={t('testDetail.noParticipants')} /></Card>)}</Loader>}
            {tab === 'assignments' && (
              <Card
                flush
                title={<h2>{t('nav.assignments')}</h2>}
                action={
                  canEdit &&
                  x.status === 'published' && (
                    <Button size="sm" variant="primary" onClick={() => setAssigning(true)}>
                      <CalendarPlus /> {t('tests.assign')}
                    </Button>
                  )
                }
              >
                <div style={{ height: 12 }} />
                <Loader state={assignments}>{(items) => <AssignmentsTable items={items} onChange={reloadAll} showTest={false} />}</Loader>
                {x.status === 'draft' && <div className="alert info" style={{ margin: 16 }}>{t('tests.publishFirst')}</div>}
              </Card>
            )}
            {tab === 'content' && (
              <div className="stack">
                <Card title={t('builder.stepMain')}>
                  <dl className="kv">
                    <dt>{t('builder.description')}</dt>
                    <dd className="pre">{x.description || '—'}</dd>
                    <dt>{t('builder.instruction')}</dt>
                    <dd className="pre">{x.instruction || '—'}</dd>
                    <dt>{t('builder.duration')}</dt>
                    <dd>{x.duration_min ? t('common.minutes', { n: x.duration_min }) : t('common.unlimited')}</dd>
                    <dt>{t('builder.attempts')}</dt>
                    <dd>{x.attempts_limit}</dd>
                    <dt>{t('builder.maxScore')}</dt>
                    <dd>{x.questions.reduce((s: number, q: any) => s + q.score, 0)}</dd>
                    <dt>{t('common.created')}</dt>
                    <dd>{f.dateTime(x.created_at)}</dd>
                  </dl>
                </Card>
                {x.questions.map((q: any, i: number) => (
                  <Card key={q.id}>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow">
                        <div className="small muted">
                          {t('result.questionN', { n: i + 1 })} · {t(`qtype.${q.type}`)}
                        </div>
                        <RichText text={q.text} className="bold" />
                      </div>
                      <Badge>{t('take.points', { n: q.score })}</Badge>
                    </div>
                    {q.image_url && <img className="q-image mt" src={q.image_url} alt="" />}
                    <div className="mt-sm">
                      {q.options.map((o: any) => (
                        <div key={o.id} className="row gap-sm small" style={{ padding: '3px 0' }}>
                          {o.is_correct ? <CheckCircle2 size={15} color="var(--green)" /> : <span style={{ width: 15 }} />}
                          <OptionText type={q.type} text={o.text} />
                        </div>
                      ))}
                    </div>
                    {q.explanation && <div className="alert info mt-sm"><RichText text={q.explanation} /></div>}
                  </Card>
                ))}
              </div>
            )}
            {assigning && (
              <AssignModal
                defaults={{
                  testId: x.id,
                  durationMin: x.duration_min,
                  attemptsLimit: x.attempts_limit,
                  passScore: x.pass_score,
                  showResult: !!x.show_result,
                  showAnswers: !!x.show_answers,
                  startsAt: x.starts_at,
                  endsAt: x.ends_at,
                }}
                onClose={() => setAssigning(false)}
                onDone={() => {
                  setAssigning(false);
                  setTab('assignments');
                  reloadAll();
                }}
              />
            )}
          </>
        );
      }}
    </Loader>
  );
}

/** Test participants with search, group and result filters. */
function Participants({ attempts }: { attempts: any[] }) {
  const { t } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [outcome, setOutcome] = useState('');
  const active = !!(search || group || outcome);
  const shown = attempts.filter(
    (a) =>
      (!group || a.group_name === group) &&
      (!outcome || (outcome === 'passed') === !!a.passed) &&
      matchesSearch(search, `${a.last_name} ${a.first_name}`, `${a.first_name} ${a.last_name}`),
  );
  if (!attempts.length)
    return (
      <Card>
        <Empty title={t('testDetail.noParticipants')} />
      </Card>
    );
  return (
    <>
      <div className="filters">
        <Input className="search-input" placeholder={t('common.searchStudents')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <ValueSelect value={group} onChange={setGroup} options={distinct(attempts.map((a) => a.group_name))} allLabel={t('filters.allGroups')} />
        <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label={t('common.result')}>
          <option value="">{t('results.anyStatus')}</option>
          <option value="passed">{t('result.passed')}</option>
          <option value="failed">{t('result.failed')}</option>
        </Select>
        <ResetFilters
          active={active}
          onReset={() => {
            setSearch('');
            setGroup('');
            setOutcome('');
          }}
        />
        <span className="small muted">{t('common.totalN', { n: shown.length })}</span>
      </div>
      <Card flush>
        {shown.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('common.student')}</th>
                  <th>{t('common.group')}</th>
                  <th>{t('result.score')}</th>
                  <th>{t('common.result')}</th>
                  <th>{t('result.correct')}</th>
                  <th>{t('result.time')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a, i) => (
                  <tr key={a.id} className="click" onClick={() => nav(`/app/attempts/${a.id}/result`)}>
                    <td className="muted">{i + 1}</td>
                    <td className="bold">
                      {a.last_name} {a.first_name}
                    </td>
                    <td>{a.group_name}</td>
                    <td>
                      {a.score} / {a.max_score}
                    </td>
                    <td>
                      <PctBadge value={a.percentage} />
                    </td>
                    <td>
                      {a.correct_count} / {a.correct_count + a.wrong_count + a.skipped_count}
                    </td>
                    <td>{f.duration(a.duration_sec)}</td>
                    <td className="nowrap">{f.dateTime(a.completed_at)}</td>
                    <td>
                      <Badge tone={a.passed ? 'green' : 'red'}>{a.passed ? t('result.passed') : t('result.failed')}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title={t('common.nothingFound')} />
        )}
      </Card>
    </>
  );
}
