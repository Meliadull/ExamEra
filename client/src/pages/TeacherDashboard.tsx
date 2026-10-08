import { CalendarClock, CheckCircle2, FileText, Plus, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { useMe } from '../auth';
import { DistributionDonut, TrendChart } from '../components/charts';
import { TestStatusBadge, usePeriod } from '../components/common';
import { Card, Empty, Loader, PageHead, PctBadge, Seg, Stat } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function TeacherDashboard() {
  const me = useMe();
  const { t } = useI18n();
  const f = useFormat();
  const { period, setPeriod, from } = usePeriod('30');
  const state = useApi('/analytics/dashboard', { from });
  return (
    <>
      <PageHead
        title={t('dashboard.hello', { name: me.first_name })}
        subtitle={t('dashboard.teacherSubtitle')}
        actions={
          <>
            <span className="small muted">{t('dashboard.today', { date: f.date(new Date().toISOString()) })}</span>
            <Link to="/app/tests/new" className="btn primary">
              <Plus size={17} /> {t('tests.create')}
            </Link>
          </>
        }
      />
      <Loader state={state}>
        {(d: any) => (
          <div className="stack">
            <div className="grid g4">
              <Stat icon={<FileText />} tone="green" value={d.counts.activeTests} label={t('dashboard.activeTests')} />
              <Stat icon={<Users />} tone="blue" value={d.counts.students} label={t('nav.students')} />
              <Stat icon={<Trophy />} tone="green" value={f.pct(d.avgPercentage)} label={t('dashboard.avgResult')} />
              <Stat icon={<CheckCircle2 />} tone="orange" value={d.counts.completedAttempts} label={t('dashboard.completedWorks')} />
            </div>
            <div className="grid g-main">
              <Card
                title={t('dashboard.avgTrend')}
                action={
                  <Seg
                    value={period}
                    onChange={setPeriod}
                    options={[
                      { id: '7', label: t('period.7short') },
                      { id: '30', label: t('period.30short') },
                      { id: '180', label: t('period.180short') },
                      { id: '365', label: t('period.365short') },
                    ]}
                  />
                }
              >
                <TrendChart data={d.dynamics} />
              </Card>
              <Card title={t('analytics.distribution')}>
                <DistributionDonut data={d.distribution} centerLabel={t('analytics.results')} />
              </Card>
            </div>
            <div className="grid g-main">
              <Card title={t('dashboard.recentTests')} action={<Link to="/app/tests">{t('common.viewAll')}</Link>}>
                {d.recentTests.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.test')}</th>
                          <th>{t('common.subject')}</th>
                          <th>{t('nav.students')}</th>
                          <th>{t('dashboard.avgResult')}</th>
                          <th>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.recentTests.map((x: any) => (
                          <tr key={x.id}>
                            <td className="bold">
                              <Link to={`/app/tests/${x.id}`}>{x.title}</Link>
                            </td>
                            <td>{x.subject_name}</td>
                            <td>{x.participants}</td>
                            <td>{x.avg_percentage != null ? <PctBadge value={x.avg_percentage} /> : '—'}</td>
                            <td>
                              <TestStatusBadge status={x.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title={t('tests.empty')} />
                )}
              </Card>
              <Card title={t('dashboard.upcoming')} action={<Link to="/app/assignments">{t('common.viewAll')}</Link>}>
                {d.upcoming.length ? (
                  d.upcoming.map((a: any) => {
                    const active = Date.parse(a.starts_at) <= Date.now();
                    return (
                      <div className="list-item" key={a.id}>
                        <div className={`list-icon tone-${active ? 'blue' : 'orange'}`}>
                          <CalendarClock />
                        </div>
                        <div className="grow">
                          <div className="bold ellipsis">
                            {a.subject_name} — {a.title}
                          </div>
                          <div className="small muted">
                            {a.target} · {active ? t('student.until', { date: f.dateTime(a.ends_at) }) : f.dateTime(a.starts_at)}
                          </div>
                        </div>
                        <span className={`badge ${active ? 'blue' : 'orange'}`}>{active ? t('assign.state.active') : f.relative(a.starts_at)}</span>
                      </div>
                    );
                  })
                ) : (
                  <Empty title={t('assign.empty')} />
                )}
              </Card>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}
