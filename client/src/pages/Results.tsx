import { Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { downloadUrl, useApi } from '../api';
import { GroupSelect, PeriodSelect, SubjectSelect, usePeriod } from '../components/common';
import { Badge, Button, Card, Empty, Input, Loader, PageHead, Pager, PctBadge, Select } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

export function Results() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const nav = useNavigate();
  const { period, setPeriod, from } = usePeriod('all');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(1);
  const filters = { from, search, subjectId, groupId, status };
  const list = useApi<any>('/results', { ...filters, sort, page });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };
  return (
    <>
      <PageHead
        title={t('nav.results')}
        subtitle={t('results.subtitle')}
        actions={
          <>
            <Button onClick={() => downloadUrl('/reports/results', { ...filters, format: 'xlsx', lang })}>
              <FileSpreadsheet /> XLSX
            </Button>
            <Button onClick={() => downloadUrl('/reports/results', { ...filters, format: 'csv', lang })}>
              <Download /> CSV
            </Button>
          </>
        }
      />
      <div className="filters">
        <Input className="search-input" placeholder={t('results.search')} value={search} onChange={(e) => reset(setSearch)(e.target.value)} />
        <PeriodSelect value={period} onChange={reset(setPeriod)} />
        <SubjectSelect value={subjectId} onChange={reset(setSubjectId)} />
        <GroupSelect value={groupId} onChange={reset(setGroupId)} />
        <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
          <option value="">{t('results.anyStatus')}</option>
          <option value="passed">{t('result.passed')}</option>
          <option value="failed">{t('result.failed')}</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="date">{t('results.sortDate')}</option>
          <option value="percentage">{t('results.sortScore')}</option>
          <option value="student">{t('results.sortStudent')}</option>
        </Select>
      </div>
      <Loader state={list}>
        {(d) => (
          <>
            <div className="row wrap mb small">
              <Badge tone="blue">{t('results.found', { n: d.total })}</Badge>
              <Badge tone="gray">
                {t('dashboard.avgResult')}: {f.pct(d.summary.avg_percentage)}
              </Badge>
              <Badge tone="green">
                {t('analytics.passed')}: {d.summary.passed ?? 0}
              </Badge>
              <Badge tone="red">
                {t('analytics.notPassed')}: {d.summary.failed ?? 0}
              </Badge>
            </div>
            <Card flush>
              {d.items.length ? (
                <>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.student')}</th>
                          <th>{t('common.group')}</th>
                          <th>{t('common.test')}</th>
                          <th>{t('result.score')}</th>
                          <th>{t('common.result')}</th>
                          <th>{t('result.time')}</th>
                          <th>{t('common.date')}</th>
                          <th>{t('common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((r: any) => (
                          <tr key={r.id} className="click" onClick={() => nav(`/app/attempts/${r.id}/result`)}>
                            <td className="bold">
                              {r.last_name} {r.first_name}
                            </td>
                            <td>{r.group_name}</td>
                            <td>
                              {r.title}
                              <div className="tiny muted">{r.subject_name}</div>
                            </td>
                            <td>
                              {r.score} / {r.max_score}
                            </td>
                            <td>
                              <PctBadge value={r.percentage} />
                            </td>
                            <td>{f.duration(r.duration_sec)}</td>
                            <td className="nowrap">{f.dateTime(r.completed_at)}</td>
                            <td>
                              <Badge tone={r.passed ? 'green' : 'red'}>{r.passed ? t('result.passed') : t('result.failed')}</Badge>
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
              )}
            </Card>
          </>
        )}
      </Loader>
    </>
  );
}
