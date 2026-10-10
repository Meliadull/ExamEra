import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Check, CloudOff, Flag, Loader2, Timer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { OptionText } from '../components/common';
import { RichText } from '../components/RichText';
import { Button, Card, ErrorBox, Input, Modal, Progress, Spinner } from '../components/ui';
import { useI18n } from '../i18n';
import { ThemeToggle } from '../theme';
import type { Question } from '../types';

type Answer = number | number[] | string | null;
interface AttemptData {
  id: number;
  status: string;
  deadline_at: string;
  server_now: string;
  test: { id: number; title: string; subject: string; instruction: string; topic: string };
  questions: Question[];
  answers: Record<string, { answer: Answer; flagged: boolean }>;
}

const isAnswered = (a: Answer | undefined) =>
  a !== null && a !== undefined && !(Array.isArray(a) && a.length === 0) && !(typeof a === 'string' && a.trim() === '');

export function TakeTest() {
  const { id } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const storageKey = `ee_attempt_${id}`;

  const [data, setData] = useState<AttemptData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [confirm, setConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const dirty = useRef<Set<number>>(new Set());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const flagsRef = useRef(flags);
  flagsRef.current = flags;
  const clockOffset = useRef(0);
  const finishedRef = useRef(false);

  const persistLocal = useCallback(() => {
    try {
      const pending = Object.fromEntries([...dirty.current].map((q) => [q, answersRef.current[q] ?? null]));
      localStorage.setItem(storageKey, JSON.stringify(pending));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey]);

  const flush = useCallback(async () => {
    if (!dirty.current.size || finishedRef.current) return true;
    const ids = [...dirty.current];
    const items = ids.map((q) => ({ questionId: q, answer: answersRef.current[q] ?? null, flagged: !!flagsRef.current[q] }));
    setSaveState('saving');
    try {
      await api(`/attempts/${id}/answers`, { method: 'PUT', body: { answers: items } });
      ids.forEach((q) => {
        if (answersRef.current[q] === items.find((i) => i.questionId === q)?.answer) dirty.current.delete(q);
      });
      persistLocal();
      setSaveState(dirty.current.size ? 'saving' : 'saved');
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'attempt_closed') {
        finishedRef.current = true;
        nav(`/app/attempts/${id}/result`, { replace: true });
        return false;
      }
      setSaveState('offline');
      return false;
    }
  }, [id, nav, persistLocal]);

  // Load attempt and merge any answers that were not yet confirmed by the server (e.g. after a refresh while offline).
  useEffect(() => {
    api<AttemptData>(`/attempts/${id}`)
      .then((d) => {
        if (d.status === 'completed') return nav(`/app/attempts/${id}/result`, { replace: true });
        clockOffset.current = Date.parse(d.server_now) - Date.now();
        const a: Record<number, Answer> = {};
        const fl: Record<number, boolean> = {};
        for (const [q, v] of Object.entries(d.answers)) {
          a[+q] = v.answer;
          fl[+q] = v.flagged;
        }
        try {
          const pending = JSON.parse(localStorage.getItem(storageKey) || '{}');
          for (const [q, v] of Object.entries(pending)) {
            if (d.questions.some((x) => x.id === +q)) {
              a[+q] = v as Answer;
              dirty.current.add(+q);
            }
          }
        } catch {
          /* ignore */
        }
        setAnswers(a);
        setFlags(fl);
        setData(d);
        if (dirty.current.size) setTimeout(flush, 0);
      })
      .catch(setError);
  }, [id, nav, storageKey, flush]);

  const finish = useCallback(
    async (auto = false) => {
      if (finishedRef.current) return;
      setFinishing(true);
      const items = [...dirty.current].map((q) => ({ questionId: q, answer: answersRef.current[q] ?? null, flagged: !!flagsRef.current[q] }));
      try {
        await api(`/attempts/${id}/finish`, { body: { answers: items } });
        finishedRef.current = true;
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        nav(`/app/attempts/${id}/result`, { replace: true, state: { auto } });
      } catch (e) {
        setFinishing(false);
        setError(e);
      }
    },
    [id, nav, storageKey],
  );

  // Timer
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((Date.parse(data.deadline_at) - (Date.now() + clockOffset.current)) / 1000));
      setRemaining(left);
      if (left <= 0 && !finishedRef.current) finish(true);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, [data, finish]);

  // Periodic autosave + warn before leaving with unsaved answers
  useEffect(() => {
    const h = setInterval(flush, 15_000);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size && !finishedRef.current) {
        persistLocal();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(h);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flush, persistLocal]);

  const textTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setAnswer = (qid: number, value: Answer, debounce = false) => {
    setAnswers((s) => ({ ...s, [qid]: value }));
    answersRef.current = { ...answersRef.current, [qid]: value };
    dirty.current.add(qid);
    persistLocal();
    clearTimeout(textTimer.current);
    if (debounce) textTimer.current = setTimeout(flush, 800);
    else flush();
  };

  const toggleFlag = (qid: number) => {
    setFlags((s) => ({ ...s, [qid]: !s[qid] }));
    flagsRef.current = { ...flagsRef.current, [qid]: !flagsRef.current[qid] };
    dirty.current.add(qid);
    flush();
  };

  const go = (i: number) => {
    flush();
    setIdx(i);
    window.scrollTo({ top: 0 });
  };

  const answeredCount = useMemo(() => (data ? data.questions.filter((q) => isAnswered(answers[q.id])).length : 0), [data, answers]);

  if (error && !data) {
    return (
      <div className="take" style={{ padding: 40 }}>
        <Card>
          <ErrorBox error={error} />
          <Button className="mt" onClick={() => nav('/app/my-tests')}>
            {t('common.back')}
          </Button>
        </Card>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const q = data.questions[idx];
  const total = data.questions.length;
  const mm = remaining != null ? Math.floor(remaining / 60) : 0;
  const ss = remaining != null ? remaining % 60 : 0;
  const hh = Math.floor(mm / 60);
  const timeText = remaining == null ? '--:--' : hh ? `${hh}:${String(mm % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const value = answers[q.id];
  const unanswered = total - answeredCount;

  return (
    <div className="take">
      <header className="take-head">
        <div className="subj">{data.test.subject.slice(0, 1)}</div>
        <div className="grow">
          <h2 className="ellipsis">
            {data.test.subject} — {data.test.title}
          </h2>
          <div className="save-state">
            {saveState === 'saved' && (
              <>
                <Check size={13} /> {t('take.saved')}
              </>
            )}
            {saveState === 'saving' && (
              <>
                <Loader2 size={13} /> {t('take.saving')}
              </>
            )}
            {saveState === 'offline' && (
              <span style={{ color: 'var(--red)' }} className="row gap-sm">
                <CloudOff size={13} /> {t('take.offline')}
              </span>
            )}
          </div>
        </div>
        <ThemeToggle />
        <div className={`timer ${remaining != null && remaining < 60 ? 'warn' : ''}`} title={t('take.timeLeft')} style={{ marginLeft: 8 }}>
          <Timer /> {timeText}
        </div>
      </header>

      <div className="take-body">
        <aside className="stack">
          <Card>
            <div className="bold mb" style={{ marginBottom: 12 }}>
              {t('take.questions')}
            </div>
            <div className="qnav">
              {data.questions.map((x, i) => (
                <button
                  key={x.id}
                  className={[i === idx ? 'current' : isAnswered(answers[x.id]) ? 'answered' : '', flags[x.id] ? 'flagged' : ''].join(' ')}
                  onClick={() => go(i)}
                  aria-label={t('take.questionOf', { n: i + 1, total })}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="small muted mt">
              {t('take.answeredCount', { n: answeredCount, total })}
            </div>
            <Button variant="primary" block className="mt" onClick={() => setConfirm(true)}>
              <Flag /> {t('take.finish')}
            </Button>
          </Card>
          {data.test.instruction && (
            <Card>
              <div className="small muted pre">{data.test.instruction}</div>
            </Card>
          )}
        </aside>

        <Card>
          <div className="row between small" style={{ marginBottom: 8 }}>
            <span className="bold">{t('take.questionOf', { n: idx + 1, total })}</span>
            <span className="muted">{t('take.percentDone', { n: Math.round((answeredCount / total) * 100) })}</span>
          </div>
          <Progress value={(answeredCount / total) * 100} />
          <div className="row between" style={{ alignItems: 'flex-start', marginTop: 20 }}>
            <RichText text={q.text} className="q-text grow" />
            <span className="badge gray" style={{ marginTop: 8 }}>
              {t('take.points', { n: q.score })}
            </span>
          </div>
          {q.image_url && <img className="q-image" src={q.image_url} alt="" />}
          <div className="small muted" style={{ marginBottom: 10 }}>
            {t(`take.hint.${q.type}`)}
          </div>

          {q.type === 'short_text' ? (
            <Input
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => setAnswer(q.id, e.target.value, true)}
              onBlur={flush}
              placeholder={t('take.typeAnswer')}
              maxLength={1000}
              style={{ height: 48, fontSize: 16 }}
              autoFocus
            />
          ) : (
            q.options.map((o) => {
              const multiple = q.type === 'multiple';
              const selected = multiple ? Array.isArray(value) && value.includes(o.id) : value === o.id;
              return (
                <label key={o.id} className={`answer-opt ${selected ? 'selected' : ''}`}>
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={`q${q.id}`}
                    checked={selected}
                    onChange={() => {
                      if (multiple) {
                        const cur = Array.isArray(value) ? value : [];
                        setAnswer(q.id, selected ? cur.filter((x) => x !== o.id) : [...cur, o.id]);
                      } else setAnswer(q.id, o.id);
                    }}
                  />
                  <OptionText type={q.type} text={o.text} />
                </label>
              );
            })
          )}

          <div className="row between mt" style={{ marginTop: 24, flexWrap: 'wrap' }}>
            <Button onClick={() => go(idx - 1)} disabled={idx === 0}>
              <ArrowLeft /> {t('take.prev')}
            </Button>
            <div className="row gap-sm">
              <Button variant="ghost" onClick={() => toggleFlag(q.id)} style={flags[q.id] ? { color: '#d97706' } : undefined}>
                <Bookmark /> {flags[q.id] ? t('take.unflag') : t('take.flag')}
              </Button>
              {isAnswered(value) && (
                <Button variant="ghost" onClick={() => setAnswer(q.id, null)}>
                  {t('take.clear')}
                </Button>
              )}
            </div>
            {idx < total - 1 ? (
              <Button variant="primary" onClick={() => go(idx + 1)}>
                {t('take.next')} <ArrowRight />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setConfirm(true)}>
                <Flag /> {t('take.finish')}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {confirm && (
        <Modal
          title={t('take.finishTitle')}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button onClick={() => setConfirm(false)}>{t('take.backToTest')}</Button>
              <Button variant="primary" loading={finishing} onClick={() => finish(false)}>
                {t('take.finishConfirm')}
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>{t('take.finishText')}</p>
          {unanswered > 0 && (
            <div className="alert warning">
              <AlertTriangle /> {t('take.unansweredWarn', { n: unanswered })}
            </div>
          )}
          {!!error && <ErrorBox error={error} />}
        </Modal>
      )}
      {finishing && !confirm && (
        <div className="modal-back">
          <Card>
            <Spinner />
            <div className="center">{t('take.timeUp')}</div>
          </Card>
        </div>
      )}
    </div>
  );
}
