import { BarChart3, FileSpreadsheet, FileText, GraduationCap, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { downloadUrl, useApi } from '../api';
import { useMe } from '../auth';
import { GroupSelect, PeriodSelect, usePeriod } from '../components/common';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { PageHead } from '../components/ui';
import { useI18n } from '../i18n';

function ReportCard({ icon, tone, title, text, children, onExport, disabled }: { icon: ReactNode; tone: string; title: string; text: string; children?: ReactNode; onExport: (format: 'xlsx' | 'csv') => void; disabled?: boolean }) {
  return (
    <Card>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className={`stat-icon tone-${tone}`}>{icon}</div>
        <div className="grow">
          <h3>{title}</h3>
          <p className="small muted" style={{ margin: '4px 0 0' }}>
            {text}
          </p>
        </div>
      </div>
      {children && <div className="mt">{children}</div>}
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        <Button size="sm" disabled={disabled} onClick={() => onExport('csv')}>
          CSV
        </Button>
        <Button size="sm" variant="primary" disabled={disabled} onClick={() => onExport('xlsx')}>
          <FileSpreadsheet /> XLSX
        </Button>
      </div>
    </Card>
  );
}

export function Reports() {
  const { t, lang } = useI18n();
  const me = useMe();
  const { period, setPeriod, from } = usePeriod('all');
  const tests = useApi<any[]>('/tests', { status: '' });
  const [testId, setTestId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const students = useApi<any>('/users', { role: 'student', search: studentSearch, pageSize: 30 });
  const [studentId, setStudentId] = useState('');

  return (
    <>
      <PageHead title={t('nav.reports')} subtitle={t('reports.subtitle')} actions={<PeriodSelect value={period} onChange={setPeriod} />} />
      <div className="grid g2">
        <ReportCard
          icon={<FileText />}
          tone="blue"
          title={t('reports.byTest')}
          text={t('reports.byTestText')}
          disabled={!testId}
          onExport={(format) => downloadUrl(`/reports/test/${testId}`, { format, lang, from })}
        >
          <Field label={t('common.test')}>
            <Select value={testId} onChange={(e) => setTestId(e.target.value)}>
              <option value="">{t('reports.chooseTest')}</option>
              {tests.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} — {x.subject_name}
                </option>
              ))}
            </Select>
          </Field>
        </ReportCard>
        <ReportCard
          icon={<Users />}
          tone="green"
          title={t('reports.byGroup')}
          text={t('reports.byGroupText')}
          disabled={!groupId}
          onExport={(format) => downloadUrl(`/reports/group/${groupId}`, { format, lang, from })}
        >
          <Field label={t('common.group')}>
            <GroupSelect value={groupId} onChange={setGroupId} />
          </Field>
        </ReportCard>
        <ReportCard
          icon={<GraduationCap />}
          tone="orange"
          title={t('reports.byStudent')}
          text={t('reports.byStudentText')}
          disabled={!studentId}
          onExport={(format) => downloadUrl(`/reports/student/${studentId}`, { format, lang, from })}
        >
          <div className="form-grid">
            <Field label={t('common.search')}>
              <Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder={t('common.searchStudents')} />
            </Field>
            <Field label={t('common.student')}>
              <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{t('reports.chooseStudent')}</option>
                {students.data?.items.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.last_name} {s.first_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </ReportCard>
        {me.role !== 'teacher' ? (
          <ReportCard icon={<BarChart3 />} tone="purple" title={t('reports.summary')} text={t('reports.summaryText')} onExport={(format) => downloadUrl('/reports/summary', { format, lang })} />
        ) : (
          <ReportCard icon={<BarChart3 />} tone="purple" title={t('reports.allResults')} text={t('reports.allResultsText')} onExport={(format) => downloadUrl('/reports/results', { format, lang, from })} />
        )}
      </div>
    </>
  );
}
