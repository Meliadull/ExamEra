import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, Copy, Download, Image as ImageIcon, Plus, Save, Send, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, downloadUrl, fileToBase64, patch, put, useApi } from '../api';
import { useMe } from '../auth';
import { useGroups, useSubjects } from '../components/common';
import { RichText } from '../components/RichText';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHead, Select, Spinner, Textarea, ToggleRow, errorText, useAction, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import type { QuestionType } from '../types';

interface QOption {
  text: string;
  isCorrect: boolean;
}
interface QDraft {
  key: string;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  explanation: string;
  score: number;
  options: QOption[];
}
interface Meta {
  title: string;
  subjectId: number | '';
  topic: string;
  description: string;
  instruction: string;
  durationMin: string;
  attemptsLimit: string;
  passScore: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResult: boolean;
  showAnswers: boolean;
  multipleScoring: 'strict' | 'partial';
  startsAt: string;
  endsAt: string;
}

const LETTERS = 'ABCDEFGHIJKL';
const uid = () => Math.random().toString(36).slice(2);
const TYPES: QuestionType[] = ['single', 'multiple', 'yes_no', 'true_false', 'short_text'];

function blankQuestion(type: QuestionType = 'single'): QDraft {
  const options =
    type === 'yes_no'
      ? [{ text: 'yes', isCorrect: true }, { text: 'no', isCorrect: false }]
      : type === 'true_false'
        ? [{ text: 'true', isCorrect: true }, { text: 'false', isCorrect: false }]
        : type === 'short_text'
          ? [{ text: '', isCorrect: true }]
          : [0, 1, 2, 3].map(() => ({ text: '', isCorrect: false }));
  return { key: uid(), type, text: '', imageUrl: null, explanation: '', score: 1, options };
}

function questionErrors(q: QDraft): string[] {
  const e: string[] = [];
  if (!q.text.trim()) e.push('missing_question');
  if (!(q.score > 0)) e.push('invalid_score');
  const filled = q.options.filter((o) => o.text.trim());
  const correct = filled.filter((o) => o.isCorrect).length;
  if (q.type === 'short_text') {
    if (!filled.length) e.push('need_accepted_answer');
  } else if (q.type === 'yes_no' || q.type === 'true_false') {
    if (q.options.filter((o) => o.isCorrect).length !== 1) e.push('need_one_correct');
  } else {
    if (filled.length < 2) e.push('need_two_options');
    if (q.type === 'single' && correct !== 1) e.push('need_one_correct');
    if (q.type === 'multiple' && correct < 1) e.push('need_correct');
  }
  return e;
}

const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function QuestionEditor({ q, n, total, onChange, onRemove, onMove, onDuplicate, showErrors }: { q: QDraft; n: number; total: number; onChange: (q: QDraft) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; showErrors: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const errors = showErrors ? questionErrors(q) : [];
  const set = (patchQ: Partial<QDraft>) => onChange({ ...q, ...patchQ });
  const setOpt = (i: number, o: Partial<QOption>) => set({ options: q.options.map((x, j) => (j === i ? { ...x, ...o } : x)) });
  const markCorrect = (i: number) => {
    if (q.type === 'multiple') setOpt(i, { isCorrect: !q.options[i].isCorrect });
    else set({ options: q.options.map((x, j) => ({ ...x, isCorrect: j === i })) });
  };
  const changeType = (type: QuestionType) => {
    const b = blankQuestion(type);
    const keep = (type === 'single' || type === 'multiple') && (q.type === 'single' || q.type === 'multiple');
    set({ type, options: keep ? q.options.map((o, i) => ({ ...o, isCorrect: type === 'single' ? i === q.options.findIndex((x) => x.isCorrect) : o.isCorrect })) : b.options });
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await api('/uploads/image', { body: { data: await fileToBase64(file) } });
      set({ imageUrl: r.url });
    } catch (e) {
      toast(errorText(t, e), 'error');
    } finally {
      setUploading(false);
    }
  };
  const binary = q.type === 'yes_no' || q.type === 'true_false';

  return (
    <div className={`q-card ${errors.length ? 'error' : ''}`}>
      <div className="q-head">
        <span className="bold">{t('result.questionN', { n })}</span>
        <Select className="sm" style={{ width: 'auto', minWidth: 200 }} value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`qtype.${x}`)}
            </option>
          ))}
        </Select>
        <span className="row gap-sm small muted">
          {t('builder.points')}
          <Input className="sm" type="number" min={0.5} max={100} step={0.5} style={{ width: 72 }} value={q.score} onChange={(e) => set({ score: Number(e.target.value) })} />
        </span>
        <span className="grow" />
        <Button size="sm" variant="ghost" className="icon" disabled={n === 1} onClick={() => onMove(-1)} title={t('builder.moveUp')}>
          <ArrowUp />
        </Button>
        <Button size="sm" variant="ghost" className="icon" disabled={n === total} onClick={() => onMove(1)} title={t('builder.moveDown')}>
          <ArrowDown />
        </Button>
        <Button size="sm" variant="ghost" className="icon" onClick={onDuplicate} title={t('builder.duplicate')}>
          <Copy />
        </Button>
        <Button size="sm" variant="ghost" className="icon" onClick={onRemove} title={t('common.delete')}>
          <Trash2 />
        </Button>
      </div>
      <Textarea placeholder={t('builder.questionPlaceholder')} value={q.text} onChange={(e) => set({ text: e.target.value })} style={{ minHeight: 70 }} />
      {q.text.includes('$') || q.text.includes('|') ? (
        <div className="card mt-sm" style={{ padding: 12, boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div className="tiny muted">{t('builder.preview')}</div>
          <RichText text={q.text} />
        </div>
      ) : null}
      <div className="row wrap mt-sm">
        {q.imageUrl ? (
          <span className="chip">
            <ImageIcon size={14} /> <a href={q.imageUrl} target="_blank" rel="noreferrer">{t('builder.image')}</a>
            <button onClick={() => set({ imageUrl: null })} aria-label="remove">
              <X size={14} />
            </button>
          </span>
        ) : (
          <label className="btn sm ghost" style={{ cursor: 'pointer' }}>
            {uploading ? <Spinner /> : <ImageIcon />} {t('builder.addImage')}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        )}
        <span className="tiny muted">{t('builder.formulaHint')}</span>
      </div>

      <div className="mt">
        {q.type === 'short_text' ? (
          <>
            <div className="label">{t('builder.acceptedAnswers')}</div>
            {q.options.map((o, i) => (
              <div className="opt-row" key={i}>
                <Input value={o.text} placeholder={t('builder.acceptedPlaceholder')} onChange={(e) => setOpt(i, { text: e.target.value })} />
                <Button size="sm" variant="ghost" className="icon" disabled={q.options.length <= 1} onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}>
                  <X />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="mt-sm" onClick={() => set({ options: [...q.options, { text: '', isCorrect: true }] })}>
              <Plus /> {t('builder.addAccepted')}
            </Button>
          </>
        ) : (
          <>
            {q.options.map((o, i) => (
              <div className="opt-row" key={i}>
                <span className="opt-letter">{LETTERS[i]}</span>
                {binary ? (
                  <div className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}>
                    {t(`q.opt.${o.text}`)}
                  </div>
                ) : (
                  <Input value={o.text} placeholder={t('builder.optionPlaceholder', { l: LETTERS[i] })} onChange={(e) => setOpt(i, { text: e.target.value })} />
                )}
                <button type="button" className={`correct-toggle ${o.isCorrect ? 'on' : ''}`} onClick={() => markCorrect(i)}>
                  {o.isCorrect ? <CheckCircle2 /> : <Check />} {t('builder.correct')}
                </button>
                {!binary && (
                  <Button size="sm" variant="ghost" className="icon" disabled={q.options.length <= 2} onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {!binary && q.options.length < 10 && (
              <Button size="sm" variant="ghost" className="mt-sm" onClick={() => set({ options: [...q.options, { text: '', isCorrect: false }] })}>
                <Plus /> {t('builder.addOption')}
              </Button>
            )}
          </>
        )}
      </div>
      <Field label={t('builder.explanation')} className="mt">
        <Textarea style={{ minHeight: 56 }} value={q.explanation} placeholder={t('builder.explanationPlaceholder')} onChange={(e) => set({ explanation: e.target.value })} />
      </Field>
      {errors.length > 0 && (
        <div className="alert error mt-sm">
          {errors.map((e) => t(`qerr.${e}`)).join(' · ')}
        </div>
      )}
    </div>
  );
}

export function TestBuilder() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const me = useMe();
  const subjects = useSubjects(me.role === 'teacher');
  const groups = useGroups();
  const existing = useApi<any>(id ? `/tests/${id}` : null);
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState<Meta>({
    title: '',
    subjectId: '',
    topic: '',
    description: '',
    instruction: '',
    durationMin: '30',
    attemptsLimit: '1',
    passScore: '60',
    shuffleQuestions: false,
    shuffleOptions: false,
    showResult: true,
    showAnswers: false,
    multipleScoring: 'strict',
    startsAt: '',
    endsAt: '',
  });
  const [questions, setQuestions] = useState<QDraft[]>([blankQuestion()]);
  const [assignGroups, setAssignGroups] = useState<number[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [metaTouched, setMetaTouched] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    const x = existing.data;
    if (!x) return;
    setMeta({
      title: x.title,
      subjectId: x.subject_id,
      topic: x.topic,
      description: x.description,
      instruction: x.instruction,
      durationMin: x.duration_min ? String(x.duration_min) : '',
      attemptsLimit: String(x.attempts_limit),
      passScore: String(x.pass_score),
      shuffleQuestions: !!x.shuffle_questions,
      shuffleOptions: !!x.shuffle_options,
      showResult: !!x.show_result,
      showAnswers: !!x.show_answers,
      multipleScoring: x.multiple_scoring,
      startsAt: toLocalInput(x.starts_at),
      endsAt: toLocalInput(x.ends_at),
    });
    setQuestions(
      x.questions.length
        ? x.questions.map((q: any) => ({
            key: uid(),
            type: q.type,
            text: q.text,
            imageUrl: q.image_url,
            explanation: q.explanation,
            score: q.score,
            options: q.options.map((o: any) => ({ text: o.text, isCorrect: !!o.is_correct })),
          }))
        : [blankQuestion()],
    );
  }, [existing.data]);

  useEffect(() => {
    if (isNew && subjects.data?.length && meta.subjectId === '') setMeta((m) => ({ ...m, subjectId: subjects.data![0].id }));
  }, [isNew, subjects.data, meta.subjectId]);

  const locked = !!existing.data?.has_attempts;
  // An older test may use a subject that is no longer assigned to the teacher — keep it selectable.
  const subjectOptions = useMemo(() => {
    const list = subjects.data ?? [];
    const x = existing.data;
    return x && !list.some((s) => s.id === x.subject_id) ? [...list, { id: x.subject_id, name: x.subject_name, topics: [] as string[] }] : list;
  }, [subjects.data, existing.data]);
  const subject = subjectOptions.find((s) => s.id === meta.subjectId);
  const maxScore = useMemo(() => questions.reduce((s, q) => s + (Number(q.score) || 0), 0), [questions]);
  const invalidCount = questions.filter((q) => questionErrors(q).length).length;
  const metaValid = meta.title.trim() && meta.subjectId !== '';
  const setM = (p: Partial<Meta>) => setMeta((m) => ({ ...m, ...p }));

  const steps = [t('builder.stepMain'), t('builder.stepQuestions'), t('builder.stepSettings'), t('builder.stepAssign'), t('builder.stepPublish')];

  const payload = () => ({
    title: meta.title.trim(),
    subjectId: Number(meta.subjectId),
    topic: meta.topic.trim(),
    description: meta.description,
    instruction: meta.instruction,
    durationMin: meta.durationMin ? Number(meta.durationMin) : null,
    attemptsLimit: Number(meta.attemptsLimit) || 1,
    passScore: Number(meta.passScore),
    shuffleQuestions: meta.shuffleQuestions,
    shuffleOptions: meta.shuffleOptions,
    showResult: meta.showResult,
    showAnswers: meta.showAnswers,
    multipleScoring: meta.multipleScoring,
    startsAt: meta.startsAt ? new Date(meta.startsAt).toISOString() : null,
    endsAt: meta.endsAt ? new Date(meta.endsAt).toISOString() : null,
  });
  const qPayload = () =>
    questions.map((q) => ({
      type: q.type,
      text: q.text,
      imageUrl: q.imageUrl,
      explanation: q.explanation,
      score: Number(q.score),
      options: q.options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
    }));

  /** Saves the test and returns its id (or undefined on failure). */
  const save = async (): Promise<number | undefined> => {
    setError(null);
    if (!metaValid) {
      setMetaTouched(true);
      setStep(0);
      return undefined;
    }
    const nonEmpty = questions.filter((q) => q.text.trim() || q.options.some((o) => o.text.trim() && o.text !== 'yes' && o.text !== 'true'));
    if (nonEmpty.some((q) => questionErrors(q).length)) {
      setShowErrors(true);
      setStep(1);
      toast(t('builder.fixErrors'), 'error');
      return undefined;
    }
    try {
      if (isNew) {
        const r = await api('/tests', { body: { ...payload(), questions: qPayload().filter((_, i) => nonEmpty.includes(questions[i])), source: 'builder' } });
        return r.id;
      }
      await patch(`/tests/${id}`, payload());
      if (!locked) await put(`/tests/${id}/questions`, { questions: qPayload().filter((_, i) => nonEmpty.includes(questions[i])) });
      return Number(id);
    } catch (e) {
      setError(e);
      return undefined;
    }
  };

  const saveDraft = async () => {
    const tid = await run(save);
    if (tid) {
      toast(t('common.saved'), 'success');
      if (isNew) nav(`/app/tests/${tid}/edit`, { replace: true });
      else existing.reload();
    }
  };

  const publish = async () => {
    if (!questions.length || invalidCount) {
      setShowErrors(true);
      setStep(1);
      return;
    }
    await run(async () => {
      const tid = await save();
      if (!tid) return;
      if (!existing.data || existing.data.status === 'draft') await api(`/tests/${tid}/status`, { body: { status: 'published' } });
      if (assignGroups.length) {
        const p = payload();
        await api('/assignments', {
          body: {
            testId: tid,
            groupIds: assignGroups,
            userIds: [],
            startsAt: p.startsAt ?? new Date().toISOString(),
            endsAt: p.endsAt ?? new Date(Date.now() + 7 * 86400_000).toISOString(),
            durationMin: p.durationMin,
            attemptsLimit: p.attemptsLimit,
            passScore: p.passScore,
            showResult: p.showResult,
            showAnswers: p.showAnswers,
          },
        });
      }
      toast(assignGroups.length ? t('builder.publishedAssigned') : t('tests.statusChanged.published'), 'success');
      nav(`/app/tests/${tid}`);
    });
  };

  if (id && !existing.data) return existing.error ? <ErrorBox error={existing.error} /> : <Spinner />;

  return (
    <>
      <PageHead
        back={{ to: id ? `/app/tests/${id}` : '/app/tests', label: t('common.back') }}
        title={isNew ? t('tests.create') : t('builder.editTitle')}
        subtitle={meta.title || undefined}
        actions={
          <Button onClick={saveDraft} loading={busy}>
            <Save /> {t('builder.saveDraft')}
          </Button>
        }
      />
      <div className="stepper">
        {steps.map((s, i) => (
          <span key={s} className="row" style={{ gap: 6, flex: i < steps.length - 1 ? 1 : 'none' }}>
            <button className={`step ${i === step ? 'active' : i < step ? 'done' : ''}`} onClick={() => setStep(i)}>
              <span className="num">{i < step ? <Check size={14} /> : i + 1}</span>
              {s}
            </button>
            {i < steps.length - 1 && <span className="step-line" />}
          </span>
        ))}
      </div>
      <ErrorBox error={error} />

      {step === 0 && (
        <Card title={t('builder.mainInfo')}>
          {me.role === 'teacher' && subjects.data && !subjects.data.length && <div className="alert warning mb">{t('subjects.noneAssigned')}</div>}
          <div className="form-grid">
            <Field label={t('builder.title')} className="full" error={metaTouched && !meta.title.trim() ? t('errors.required') : undefined}>
              <Input value={meta.title} onChange={(e) => setM({ title: e.target.value })} placeholder={t('builder.titlePlaceholder')} maxLength={200} />
            </Field>
            <Field label={t('common.subject')}>
              <Select value={meta.subjectId} onChange={(e) => setM({ subjectId: Number(e.target.value) })}>
                {subjectOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('builder.topic')}>
              <Input list="topics" value={meta.topic} onChange={(e) => setM({ topic: e.target.value })} placeholder={t('builder.topicPlaceholder')} />
              <datalist id="topics">
                {subject?.topics.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label={t('builder.description')} className="full">
              <Textarea value={meta.description} onChange={(e) => setM({ description: e.target.value })} placeholder={t('builder.descriptionPlaceholder')} />
            </Field>
            <Field label={t('builder.instruction')} className="full" hint={t('builder.instructionHint')}>
              <Textarea value={meta.instruction} onChange={(e) => setM({ instruction: e.target.value })} />
            </Field>
          </div>
        </Card>
      )}

      {step === 1 && (
        <div className="stack">
          {locked && <div className="alert warning">{t('builder.lockedQuestions')}</div>}
          <div className="row between wrap">
            <div className="row gap-sm">
              <Badge tone="blue">{t('builder.questionsCount', { n: questions.length })}</Badge>
              <Badge tone="gray">{t('builder.maxScoreN', { n: maxScore })}</Badge>
              {showErrors && invalidCount > 0 && <Badge tone="red">{t('builder.invalidN', { n: invalidCount })}</Badge>}
            </div>
          </div>
          <fieldset disabled={locked} style={{ border: 'none', padding: 0, margin: 0 }} className="stack">
            {questions.map((q, i) => (
              <QuestionEditor
                key={q.key}
                q={q}
                n={i + 1}
                total={questions.length}
                showErrors={showErrors}
                onChange={(nq) => setQuestions((s) => s.map((x) => (x.key === q.key ? nq : x)))}
                onRemove={() => setQuestions((s) => s.filter((x) => x.key !== q.key))}
                onDuplicate={() => setQuestions((s) => [...s.slice(0, i + 1), { ...structuredClone(q), key: uid() }, ...s.slice(i + 1)])}
                onMove={(d) =>
                  setQuestions((s) => {
                    const a = [...s];
                    [a[i], a[i + d]] = [a[i + d], a[i]];
                    return a;
                  })
                }
              />
            ))}
            <div className="row wrap">
              <Button onClick={() => setQuestions((s) => [...s, blankQuestion()])}>
                <Plus /> {t('builder.addQuestion')}
              </Button>
              <Button variant="ghost" onClick={() => setQuestions((s) => [...s, blankQuestion('multiple')])}>
                <Plus /> {t('qtype.multiple')}
              </Button>
              <Button variant="ghost" onClick={() => setQuestions((s) => [...s, blankQuestion('true_false')])}>
                <Plus /> {t('qtype.true_false')}
              </Button>
              <Button variant="ghost" onClick={() => setQuestions((s) => [...s, blankQuestion('short_text')])}>
                <Plus /> {t('qtype.short_text')}
              </Button>
            </div>
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="grid g2">
          <Card title={t('builder.limits')}>
            <div className="form-grid">
              <Field label={t('builder.duration')} hint={t('builder.durationHint')}>
                <Input type="number" min={1} max={600} value={meta.durationMin} onChange={(e) => setM({ durationMin: e.target.value })} placeholder={t('common.unlimited')} />
              </Field>
              <Field label={t('builder.attempts')}>
                <Input type="number" min={1} max={20} value={meta.attemptsLimit} onChange={(e) => setM({ attemptsLimit: e.target.value })} />
              </Field>
              <Field label={t('builder.passScore')}>
                <Input type="number" min={0} max={100} value={meta.passScore} onChange={(e) => setM({ passScore: e.target.value })} />
              </Field>
              <Field label={t('builder.multipleScoring')}>
                <Select value={meta.multipleScoring} onChange={(e) => setM({ multipleScoring: e.target.value as Meta['multipleScoring'] })}>
                  <option value="strict">{t('builder.scoringStrict')}</option>
                  <option value="partial">{t('builder.scoringPartial')}</option>
                </Select>
              </Field>
              <Field label={t('builder.startsAt')}>
                <Input type="datetime-local" value={meta.startsAt} onChange={(e) => setM({ startsAt: e.target.value })} />
              </Field>
              <Field label={t('builder.endsAt')}>
                <Input type="datetime-local" value={meta.endsAt} onChange={(e) => setM({ endsAt: e.target.value })} />
              </Field>
            </div>
          </Card>
          <Card title={t('builder.behaviour')}>
            <ToggleRow title={t('builder.shuffleQuestions')} hint={t('builder.shuffleQuestionsHint')} checked={meta.shuffleQuestions} onChange={(v) => setM({ shuffleQuestions: v })} />
            <ToggleRow title={t('builder.shuffleOptions')} hint={t('builder.shuffleOptionsHint')} checked={meta.shuffleOptions} onChange={(v) => setM({ shuffleOptions: v })} />
            <ToggleRow title={t('builder.showResult')} hint={t('builder.showResultHint')} checked={meta.showResult} onChange={(v) => setM({ showResult: v })} />
            <ToggleRow title={t('builder.showAnswers')} hint={t('builder.showAnswersHint')} checked={meta.showAnswers} onChange={(v) => setM({ showAnswers: v })} />
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card title={t('builder.assignTitle')}>
          <p className="muted" style={{ marginTop: 0 }}>
            {t('builder.assignHint')}
          </p>
          <div className="grid g3" style={{ gap: 8 }}>
            {groups.data?.filter((g) => g.status === 'active').map((g) => (
              <label key={g.id} className={`answer-opt ${assignGroups.includes(g.id) ? 'selected' : ''}`} style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={assignGroups.includes(g.id)}
                  onChange={() => setAssignGroups((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                />
                <span>
                  <b>{g.name}</b>
                  <div className="tiny muted">{t('groups.studentsCount', { n: g.student_count })}</div>
                </span>
              </label>
            ))}
          </div>
          <div className="alert info mt">{t('builder.assignDatesHint')}</div>
        </Card>
      )}

      {step === 4 && (
        <Card title={t('builder.summary')}>
          <dl className="kv">
            <dt>{t('builder.title')}</dt>
            <dd>{meta.title || '—'}</dd>
            <dt>{t('common.subject')}</dt>
            <dd>
              {subject?.name}
              {meta.topic ? ` · ${meta.topic}` : ''}
            </dd>
            <dt>{t('common.questions')}</dt>
            <dd>{questions.length}</dd>
            <dt>{t('builder.maxScore')}</dt>
            <dd>{maxScore}</dd>
            <dt>{t('builder.duration')}</dt>
            <dd>{meta.durationMin ? t('common.minutes', { n: meta.durationMin }) : t('common.unlimited')}</dd>
            <dt>{t('builder.attempts')}</dt>
            <dd>{meta.attemptsLimit}</dd>
            <dt>{t('builder.passScore')}</dt>
            <dd>{meta.passScore}%</dd>
            <dt>{t('builder.stepAssign')}</dt>
            <dd>{assignGroups.length ? groups.data?.filter((g) => assignGroups.includes(g.id)).map((g) => g.name).join(', ') : t('builder.noAssign')}</dd>
          </dl>
          {invalidCount > 0 && <div className="alert error mt">{t('builder.invalidN', { n: invalidCount })}</div>}
          {existing.data && existing.data.status !== 'draft' && <div className="alert info mt">{t('builder.alreadyPublished')}</div>}
          <div className="row wrap mt" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={saveDraft} loading={busy}>
              <Save /> {t('builder.saveDraft')}
            </Button>
            <Button variant="primary" onClick={publish} loading={busy} disabled={!questions.length}>
              <Send /> {existing.data && existing.data.status !== 'draft' ? t('builder.saveAndApply') : t('tests.publish')}
            </Button>
          </div>
        </Card>
      )}

      <div className="row between mt">
        <Button onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          <ArrowLeft /> {t('common.back')}
        </Button>
        {step < steps.length - 1 && (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            {t('common.next')} <ArrowRight />
          </Button>
        )}
      </div>
    </>
  );
}

/* ---------- XLSX import ---------- */

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const me = useMe();
  const subjects = useSubjects(me.role === 'teacher');
  const [preview, setPreview] = useState<any>(null);
  const [fileName, setFileName] = useState('');
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [err, setErr] = useState<unknown>(null);
  const { busy, run } = useAction();

  useEffect(() => {
    if (subjects.data?.length && subjectId === '') setSubjectId(subjects.data[0].id);
  }, [subjects.data, subjectId]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setErr(null);
    setPreview(null);
    setFileName(file.name);
    setTitle(file.name.replace(/\.xlsx$/i, ''));
    try {
      setPreview(await api('/tests/import/preview', { body: { data: await fileToBase64(file), fileName: file.name } }));
    } catch (e) {
      setErr(e);
    }
  };
  const doImport = async () => {
    const r = await run(() =>
      api('/tests', {
        body: {
          title,
          subjectId: Number(subjectId),
          source: 'import',
          questions: preview.questions.map(({ row: _r, errors: _e, ...q }: any) => q),
        },
      }),
    );
    if (r) nav(`/app/tests/${r.id}/edit`);
  };

  return (
    <Modal
      wide
      title={t('import.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={doImport} loading={busy} disabled={!preview || preview.errorCount > 0 || !title.trim()}>
            <Upload /> {t('import.confirm', { n: preview?.questions.length ?? 0 })}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="alert info">
          <span>
            {t('import.hint')}{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); downloadUrl('/tests/import/template'); }}>
              <Download size={13} /> {t('import.template')}
            </a>
          </span>
        </div>
        <label className="card center" style={{ borderStyle: 'dashed', cursor: 'pointer', boxShadow: 'none' }}>
          <Upload size={28} color="var(--primary)" />
          <div className="bold mt-sm">{fileName || t('import.choose')}</div>
          <div className="small muted">XLSX · ≤ 5 MB</div>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <ErrorBox error={err} />
        {preview && (
          <>
            <div className="form-grid">
              <Field label={t('builder.title')}>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label={t('common.subject')}>
                <Select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
                  {subjects.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {preview.errorCount > 0 ? (
              <div className="alert error">{t('import.errorsFound', { n: preview.errorCount })}</div>
            ) : (
              <div className="alert success">{t('import.ok', { n: preview.questions.length })}</div>
            )}
            <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('import.row')}</th>
                    <th>{t('common.question')}</th>
                    <th>{t('import.type')}</th>
                    <th>{t('import.answers')}</th>
                    <th>{t('builder.points')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {preview.questions.map((q: any) => (
                    <tr key={q.row} style={q.errors.length ? { background: 'var(--red-50)' } : undefined}>
                      <td>{q.row}</td>
                      <td>
                        <RichText text={q.text} inline />
                      </td>
                      <td className="nowrap small">{t(`qtype.${q.type}`)}</td>
                      <td className="small">
                        {q.options.map((o: any, i: number) => (
                          <div key={i} style={o.isCorrect ? { color: 'var(--green)', fontWeight: 600 } : undefined}>
                            {o.isCorrect ? '✓ ' : ''}
                            {o.text}
                          </div>
                        ))}
                      </td>
                      <td>{q.score}</td>
                      <td className="small" style={{ color: 'var(--red)' }}>
                        {q.errors.map((e: string) => t(`qerr.${e}`)).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
