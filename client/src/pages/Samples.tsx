import { CheckCircle2, Copy, Eye, Library } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { useMe } from '../auth';
import { matchesSearch, OptionText, ResetFilters } from '../components/common';
import { RichText } from '../components/RichText';
import { Badge, Button, Card, Empty, Input, Loader, Modal, PageHead, Select, useAction } from '../components/ui';
import { useI18n } from '../i18n';
import { useLoc, useSubjectName } from '../localize';

interface Sample {
  id: number;
  title: string;
  title_ru: string | null;
  subject_id: number;
  subject_name: string;
  sample_key: string;
  question_count: number;
  copied: number;
}

/** Read-only preview of a sample test with the correct answers marked. */
function SamplePreview({ id, onClose, onCopy, canCopy, busy }: { id: number; onClose: () => void; onCopy: () => void; canCopy: boolean; busy: boolean }) {
  const { t } = useI18n();
  const tr = useLoc();
  const test = useApi<any>(`/tests/${id}`);
  return (
    <Modal
      wide
      title={test.data ? tr(test.data, 'title') : t('samples.preview')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {canCopy && (
            <Button variant="primary" onClick={onCopy} loading={busy}>
              <Copy /> {t('samples.copy')}
            </Button>
          )}
        </>
      }
    >
      <Loader state={test}>
        {(x) => (
          <div className="stack">
            {x.questions.map((q: any, i: number) => (
              <div key={q.id}>
                <div className="small muted">{t('result.questionN', { n: i + 1 })}</div>
                <RichText text={tr(q)} className="bold" />
                <div className="mt-sm">
                  {q.options.map((o: any, j: number) => (
                    <div key={o.id} className="row gap-sm small" style={{ padding: '3px 0' }}>
                      {o.is_correct ? <CheckCircle2 size={15} color="var(--green)" /> : <span style={{ width: 15 }} />}
                      <b className="muted">{'ABCDEFGH'[j]})</b>
                      <OptionText type={q.type} text={tr(o)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Loader>
    </Modal>
  );
}

export function Samples() {
  const { t } = useI18n();
  const tr = useLoc();
  const sn = useSubjectName();
  const me = useMe();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const list = useApi<Sample[]>('/tests/samples');
  const [subject, setSubject] = useState('');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const canCopy = me.role === 'teacher' || me.role === 'admin';

  const copy = async (id: number) => {
    const r = await run(() => api<{ id: number }>(`/tests/${id}/copy`, { method: 'POST' }), t('samples.copied'));
    if (r) nav(`/app/tests/${r.id}`);
  };

  return (
    <>
      <PageHead title={t('nav.samples')} subtitle={me.role === 'teacher' ? t('samples.teacherSubtitle') : t('samples.subtitle')} />
      <Loader state={list}>
        {(all) => {
          if (!all.length) {
            return (
              <Card>
                <Empty icon={<Library />} title={t('samples.empty')} text={me.role === 'teacher' ? t('samples.emptyTeacher') : undefined} />
              </Card>
            );
          }
          const subjects = [...new Map(all.map((s) => [s.subject_id, s.subject_name])).entries()].sort((a, b) => sn(a[1]).localeCompare(sn(b[1])));
          const shown = all.filter((s) => (!subject || String(s.subject_id) === subject) && matchesSearch(search, s.title, s.title_ru));
          const groups = subjects
            .map(([id, name]) => ({ id, name, items: shown.filter((s) => s.subject_id === id) }))
            .filter((g) => g.items.length);
          return (
            <>
              <div className="filters">
                <Input className="search-input" placeholder={t('samples.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
                <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label={t('common.subject')}>
                  <option value="">{t('filters.allSubjects')}</option>
                  {subjects.map(([id, name]) => (
                    <option key={id} value={id}>
                      {sn(name)}
                    </option>
                  ))}
                </Select>
                <ResetFilters
                  active={!!(search || subject)}
                  onReset={() => {
                    setSearch('');
                    setSubject('');
                  }}
                />
                <span className="small muted">{t('samples.count', { n: shown.length })}</span>
              </div>
              {groups.length ? (
                groups.map((g) => (
                  <section key={g.id} className="mb">
                    <h2 style={{ marginBottom: 12 }}>
                      {sn(g.name)} <span className="muted small">· {t('samples.topicsN', { n: g.items.length })}</span>
                    </h2>
                    <div className="grid g3">
                      {g.items.map((s) => (
                        <Card key={s.id}>
                          <div className="row between" style={{ alignItems: 'flex-start' }}>
                            <Badge tone="blue">{t('samples.topicNo', { n: Number(s.sample_key.split(':')[1]) })}</Badge>
                            {s.copied > 0 && <Badge tone="green">{t('samples.alreadyCopied')}</Badge>}
                          </div>
                          <h3 style={{ marginTop: 10 }}>{tr(s, 'title')}</h3>
                          <div className="small muted">{t('samples.questionsN', { n: s.question_count })}</div>
                          <div className="row mt-sm" style={{ justifyContent: 'flex-end' }}>
                            <Button size="sm" variant="ghost" onClick={() => setPreview(s.id)}>
                              <Eye /> {t('samples.view')}
                            </Button>
                            {canCopy && (
                              <Button size="sm" onClick={() => copy(s.id)} disabled={busy}>
                                <Copy /> {t('samples.copy')}
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <Card>
                  <Empty title={t('common.nothingFound')} />
                </Card>
              )}
            </>
          );
        }}
      </Loader>
      {preview && <SamplePreview id={preview} onClose={() => setPreview(null)} onCopy={() => copy(preview)} canCopy={canCopy} busy={busy} />}
    </>
  );
}
