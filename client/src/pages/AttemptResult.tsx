import { CheckCircle2, Clock, EyeOff, Info, MinusCircle, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { useMe } from '../auth';
import { ScoreRing } from '../components/charts';
import { OptionText } from '../components/common';
import { RichText } from '../components/RichText';
import { Badge, Button, Card, Field, Input, Loader, Modal, PageHead, Textarea, useAction } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

function ReviewItem({ q, n }: { q: any; n: number }) {
  const { t } = useI18n();
  const chosen = (id: number) => (Array.isArray(q.answer) ? q.answer.includes(id) : q.answer === id);
  const icon = q.is_correct === 1 ? <CheckCircle2 color="var(--green)" /> : q.is_correct === 0 ? <XCircle color="var(--red)" /> : <MinusCircle color="var(--faint)" />;
  return (
    <Card>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {icon}
          <div>
            <div className="small muted">{t('result.questionN', { n })}</div>
            <RichText text={q.text} className="bold" />
          </div>
        </div>
        <Badge tone={q.is_correct === 1 ? 'green' : q.is_correct === 0 ? 'red' : 'gray'}>
          {q.score} / {q.max_score}
        </Badge>
      </div>
      {q.image_url && <img className="q-image mt" src={q.image_url} alt="" />}
      <div className="mt">
        {q.type === 'short_text' ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className={`answer-opt ${q.is_correct === 1 ? 'correct' : q.answer ? 'wrong' : ''}`} style={{ margin: 0 }}>
              <span className="muted small">{t('result.yourAnswer')}:</span> <b>{q.answer ?? '—'}</b>
            </div>
            <div className="small">
              <span className="muted">{t('result.acceptedAnswers')}:</span> {q.options.map((o: any) => o.text).join('; ')}
            </div>
          </div>
        ) : (
          q.options.map((o: any) => (
            <div key={o.id} className={`answer-opt ${o.is_correct ? 'correct' : chosen(o.id) ? 'wrong' : ''}`} style={{ cursor: 'default' }}>
              <input type={q.type === 'multiple' ? 'checkbox' : 'radio'} readOnly checked={chosen(o.id)} />
              <span className="grow">
                <OptionText type={q.type} text={o.text} />
              </span>
              {o.is_correct && <Badge tone="green">{t('result.correctAnswer')}</Badge>}
            </div>
          ))
        )}
      </div>
      {q.explanation && (
        <div className="alert info" style={{ marginTop: 10 }}>
          <Info />
          <RichText text={q.explanation} />
        </div>
      )}
    </Card>
  );
}

function AdjustScore({ r, onDone }: { r: any; onDone: () => void }) {
  const { t } = useI18n();
  const [score, setScore] = useState(String(r.score));
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Modal
      title={t('result.adjustTitle')}
      onClose={onDone}
      footer={
        <>
          <Button onClick={onDone}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const ok = await run(() => api(`/attempts/${r.id}/score`, { method: 'PATCH', body: { score: Number(score), reason } }), t('common.saved'));
              if (ok) onDone();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="alert warning mb">{t('result.adjustWarn')}</div>
      <div className="stack" style={{ gap: 14 }}>
        <Field label={`${t('result.score')} (max ${r.max_score})`}>
          <Input type="number" min={0} max={r.max_score} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label={t('result.reason')}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function AttemptResult() {
  const { id } = useParams();
  const me = useMe();
  const { t } = useI18n();
  const f = useFormat();
  const loc = useLocation() as { state?: { auto?: boolean } };
  const state = useApi(`/attempts/${id}/result`);
  const [review, setReview] = useState(me.role !== 'student');
  const [adjust, setAdjust] = useState(false);

  return (
    <Loader state={state}>
      {(r: any) => (
        <>
          {me.role !== 'student' && (
            <PageHead
              title={r.test.title}
              subtitle={`${r.student.last_name} ${r.student.first_name} · ${f.dateTime(r.completed_at)}`}
              back={{ to: r.can_open_test ? `/app/tests/${r.test.id}` : `/app/students/${r.student.id}`, label: t('common.back') }}
              actions={
                me.role === 'admin' && (
                  <Button onClick={() => setAdjust(true)}>{t('result.adjust')}</Button>
                )
              }
            />
          )}
          <div className="card center" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
            {me.role === 'student' && (
              <>
                <div style={{ fontSize: 44 }}>{r.show_result ? (r.passed ? '🏆' : '📘') : '✅'}</div>
                <h1>{t('result.finished')}</h1>
                <p className="muted" style={{ marginTop: 6 }}>
                  {r.test.subject} — {r.test.title}
                </p>
                {loc.state?.auto && <div className="alert warning" style={{ justifyContent: 'center' }}>{t('result.autoFinished')}</div>}
              </>
            )}
            {r.show_result ? (
              <>
                <div className="row" style={{ justifyContent: 'center', margin: '20px 0 6px' }}>
                  <ScoreRing value={r.percentage ?? 0} />
                </div>
                <div className="muted">
                  {t('result.pointsOf', { score: r.score, max: r.max_score })}
                </div>
                <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                  <Badge tone={r.passed ? 'green' : 'red'}>
                    {r.passed ? t('result.passed') : t('result.failed')} · {t('result.passScore', { n: r.pass_score })}
                  </Badge>
                </div>
                <div className="grid g3 mt" style={{ textAlign: 'left' }}>
                  <div className="card stat" style={{ boxShadow: 'none' }}>
                    <div className="stat-icon tone-green"><CheckCircle2 /></div>
                    <div>
                      <div className="stat-label">{t('result.correct')}</div>
                      <div className="stat-value">{r.correct_count}</div>
                    </div>
                  </div>
                  <div className="card stat" style={{ boxShadow: 'none' }}>
                    <div className="stat-icon tone-red"><XCircle /></div>
                    <div>
                      <div className="stat-label">{t('result.wrong')}</div>
                      <div className="stat-value">{r.wrong_count + r.skipped_count}</div>
                    </div>
                  </div>
                  <div className="card stat" style={{ boxShadow: 'none' }}>
                    <div className="stat-icon tone-blue"><Clock /></div>
                    <div>
                      <div className="stat-label">{t('result.time')}</div>
                      <div className="stat-value">{f.duration(r.duration_sec)}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="alert info mt" style={{ justifyContent: 'center' }}>
                <EyeOff /> {t('result.hiddenByTeacher')}
              </div>
            )}
            {r.answers_after_end && <div className="alert info mt">{t('result.answersAfterEnd')}</div>}
            {me.role === 'student' && (
              <div className="row wrap mt" style={{ justifyContent: 'center' }}>
                {r.show_answers && r.review && (
                  <Button variant="primary" onClick={() => setReview((v) => !v)}>
                    <Trophy /> {review ? t('result.hideReview') : t('result.showReview')}
                  </Button>
                )}
                {r.can_retry && (
                  <Link to="/app/my-tests" className="btn">
                    <RotateCcw size={17} /> {t('student.retry')}
                  </Link>
                )}
                <Link to="/app" className="btn">
                  {t('result.toHome')}
                </Link>
              </div>
            )}
          </div>
          {review && r.review && (
            <div className="stack mt" style={{ maxWidth: 820, margin: '24px auto 0' }}>
              <h2>{t('result.review')}</h2>
              {r.review.map((q: any, i: number) => (
                <ReviewItem key={q.id} q={q} n={i + 1} />
              ))}
            </div>
          )}
          {adjust && (
            <AdjustScore
              r={r}
              onDone={() => {
                setAdjust(false);
                state.reload();
              }}
            />
          )}
        </>
      )}
    </Loader>
  );
}
