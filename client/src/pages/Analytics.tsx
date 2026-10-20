import { AlertTriangle, CheckCircle2, Download, FileText, Trophy, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadUrl, useApi } from '../api';
import { useMe } from '../auth';
import { Bars, DistributionDonut, TrendChart } from '../components/charts';
import { GroupSelect, PeriodSelect, ResetFilters, SubjectSelect, TeacherSelect, usePeriod } from '../components/common';
import { Button, Card, Empty, Loader, PageHead, PctBadge, Stat } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function Analytics() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const me = useMe();
  const { period, setPeriod, from } = usePeriod('30');
  const [subjectId, setSubjectId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const filters = { from, subjectId, groupId, teacherId };
  const state = useApi<any>('/analytics/overview', filters);
  const delta = (cur?: number | null, prev?: number | null) => (cur != null && prev != null ? cur - prev : null);

  return (
    <>
      <PageHead
        title={me.role === 'admin' ? t('nav.systemAnalytics') : t('nav.analytics')}
        subtitle={t('analytics.subtitle')}
        actions={
          <Button onClick={() => downloadUrl('/reports/results', { ...filters, format: 'xlsx', lang })}>
            <Download /> {t('reports.export')}
          </Button>
        }
      />
      <div className="filters">
        <PeriodSelect value={period} onChange={setPeriod} />
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
        <GroupSelect value={groupId} onChange={setGroupId} />
        {me.role !== 'teacher' && <TeacherSelect value={teacherId} onChange={setTeacherId} />}
        <ResetFilters
          active={period !== '30' || !!(subjectId || groupId || teacherId)}
          onReset={() => {
            setPeriod('30');
            setSubjectId('');
            setGroupId('');
            setTeacherId('');
          }}
        />
      </div>
      <Loader state={state}>
        {(d) => (
          <div className="stack">
            <div className="grid g4">
              <Stat icon={<Trophy />} tone="blue" value={f.pct(d.kpis.avg_percentage)} delta={delta(d.kpis.avg_percentage, d.previous?.avg_percentage)} label={t('dashboard.avgResult')} />
              <Stat icon={<FileText />} tone="purple" value={d.kpis.tests} delta={delta(d.kpis.tests, d.previous?.tests)} label={t('analytics.testsCount')} />
              <Stat icon={<Users />} tone="orange" value={d.kpis.students} delta={delta(d.kpis.students, d.previous?.students)} label={t('analytics.activeStudents')} />
              <Stat icon={<CheckCircle2 />} tone="green" value={f.pct(d.kpis.pass_rate)} delta={delta(d.kpis.pass_rate, d.previous?.pass_rate)} label={t('analytics.passRate')} />
            </div>
            <div className="grid g2">
              <Card title={t('analytics.dynamics')}>
                <TrendChart data={d.dynamics} />
              </Card>
              <Card title={t('analytics.bySubject')}>
                <Bars items={d.bySubject.map((s: any) => ({ label: s.name, value: s.value }))} />
              </Card>
            </div>
            <div className="grid g2">
              <Card title={t('analytics.attentionTopics')}>
                {d.hardTopics.length ? (
                  d.hardTopics.map((x: any) => (
                    <div className="list-item" key={x.topic + x.subject_name}>
                      <div className="list-icon tone-red">
                        <AlertTriangle />
                      </div>
                      <div className="grow">
                        <div className="bold">{x.topic}</div>
                        <div className="small muted">
                          {x.subject_name} · {t('analytics.avgResultN', { n: x.value })}
                        </div>
                      </div>
                      {x.delta != null && (
                        <span className={`delta ${x.delta >= 0 ? 'up' : 'down'}`}>
                          {x.delta >= 0 ? '↑' : '↓'} {Math.abs(x.delta)}%
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title={t('analytics.noHardTopics')} />
                )}
              </Card>
              <Card title={t('analytics.distribution')}>
                <DistributionDonut data={d.distribution} centerLabel={t('analytics.results')} />
              </Card>
            </div>
            <Card title={t('analytics.hardQuestions')}>
              {d.hardQuestions.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('common.question')}</th>
                        <th>{t('common.test')}</th>
                        <th>{t('questions.answers')}</th>
                        <th>{t('analysis.correct')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.hardQuestions.map((q: any) => (
                        <tr key={q.id}>
                          <td style={{ maxWidth: 460 }} className="ellipsis">
                            №{q.position}. {q.text}
                          </td>
                          <td>
                            <Link to={`/app/tests/${q.test_id}`}>{q.test_title}</Link>
                          </td>
                          <td>{q.answers}</td>
                          <td>
                            <PctBadge value={q.correct_pct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={t('common.noData')} />
              )}
            </Card>
            <div className="grid g4">
              <Card>
                <div className="stat-label">{t('analytics.maxResult')}</div>
                <div className="stat-value">{f.pct(d.kpis.max_percentage)}</div>
              </Card>
              <Card>
                <div className="stat-label">{t('analytics.minResult')}</div>
                <div className="stat-value">{f.pct(d.kpis.min_percentage)}</div>
              </Card>
              <Card>
                <div className="stat-label">{t('analytics.avgScore')}</div>
                <div className="stat-value">{d.kpis.avg_score ?? '—'}</div>
              </Card>
              <Card>
                <div className="stat-label">{t('analytics.avgTime')}</div>
                <div className="stat-value">{f.minutes(d.kpis.avg_duration_sec)}</div>
              </Card>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}
