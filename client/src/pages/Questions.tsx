import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { SubjectSelect } from '../components/common';
import { RichText } from '../components/RichText';
import { Card, Empty, Input, Loader, PageHead, PctBadge, Select } from '../components/ui';
import { useI18n } from '../i18n';

export function Questions() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [type, setType] = useState('');
  const list = useApi<any[]>('/questions', { search, subjectId, type });
  return (
    <>
      <PageHead title={t('nav.questions')} subtitle={t('questions.subtitle')} />
      <div className="filters">
        <Input className="search-input" placeholder={t('questions.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t('questions.allTypes')}</option>
          {['single', 'multiple', 'yes_no', 'true_false', 'short_text'].map((x) => (
            <option key={x} value={x}>
              {t(`qtype.${x}`)}
            </option>
          ))}
        </Select>
      </div>
      <Card flush>
        <Loader state={list}>
          {(items) =>
            items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.question')}</th>
                      <th>{t('import.type')}</th>
                      <th>{t('common.test')}</th>
                      <th>{t('builder.points')}</th>
                      <th>{t('questions.answers')}</th>
                      <th>{t('analysis.correct')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((q) => (
                      <tr key={q.id}>
                        <td style={{ maxWidth: 420 }}>
                          <RichText text={q.text} inline />
                        </td>
                        <td className="small nowrap">{t(`qtype.${q.type}`)}</td>
                        <td>
                          <Link to={`/app/tests/${q.test_id}`}>{q.test_title}</Link>
                          <div className="tiny muted">
                            {q.subject_name}
                            {q.topic ? ` · ${q.topic}` : ''}
                          </div>
                        </td>
                        <td>{q.score}</td>
                        <td>{q.answers}</td>
                        <td>{q.correct_pct != null ? <PctBadge value={q.correct_pct} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title={t('common.nothingFound')} />
            )
          }
        </Loader>
      </Card>
    </>
  );
}
