import { CalendarPlus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, del, patch, useApi } from '../api';
import { useMe } from '../auth';
import { GroupSelect, ResetFilters, SubjectSelect, TeacherSelect, useGroups } from '../components/common';
import { Badge, Button, Card, Check, Confirm, Empty, Field, Input, Loader, Modal, PageHead, PctBadge, Select, Seg, ToggleRow, useAction } from '../components/ui';
import { useFormat, useI18n } from '../i18n';

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (s: string) => new Date(s).toISOString();

export interface AssignDefaults {
  testId?: number;
  durationMin?: number | null;
  attemptsLimit?: number;
  passScore?: number;
  showResult?: boolean;
  showAnswers?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

/** Assignment form: test → groups / students → parameters → assign. Also used for editing. */
export function AssignModal({ defaults, editing, onClose, onDone }: { defaults: AssignDefaults; editing?: any; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const groups = useGroups();
  const tests = useApi<any[]>(defaults.testId || editing ? null : '/tests', { status: 'published' });
  const [testId, setTestId] = useState<number | undefined>(defaults.testId);
  const [mode, setMode] = useState<'groups' | 'students'>('groups');
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const students = useApi<any>(mode === 'students' && !editing ? '/users' : null, { role: 'student', search: studentSearch, pageSize: 50 });
  const now = new Date();
  const [startsAt, setStartsAt] = useState(toLocalInput(editing ? new Date(editing.starts_at) : defaults.startsAt ? new Date(defaults.startsAt) : now));
  const [endsAt, setEndsAt] = useState(
    toLocalInput(editing ? new Date(editing.ends_at) : defaults.endsAt ? new Date(defaults.endsAt) : new Date(now.getTime() + 7 * 86400_000)),
  );
  const [duration, setDuration] = useState<string>(String((editing ? editing.duration_min : defaults.durationMin) ?? ''));
  const [attempts, setAttempts] = useState(String((editing ? editing.attempts_limit : defaults.attemptsLimit) ?? 1));
  const [pass, setPass] = useState(String((editing ? editing.pass_score : defaults.passScore) ?? 60));
  const [showResult, setShowResult] = useState<boolean>(editing ? !!editing.show_result : defaults.showResult ?? true);
  const [showAnswers, setShowAnswers] = useState<boolean>(editing ? !!editing.show_answers : defaults.showAnswers ?? false);
  const { busy, run } = useAction();

  useEffect(() => {
    if (!defaults.testId && tests.data && !testId) {
      const first = tests.data[0];
      if (first) setTestId(first.id);
    }
  }, [tests.data, testId, defaults.testId]);

  const params = {
    startsAt: fromLocalInput(startsAt),
    endsAt: fromLocalInput(endsAt),
    durationMin: duration ? Number(duration) : null,
    attemptsLimit: Number(attempts),
    passScore: Number(pass),
    showResult,
    showAnswers,
  };
  const submit = async () => {
    const ok = editing
      ? await run(() => patch(`/assignments/${editing.id}`, params), t('common.saved'))
      : await run(
          () => api('/assignments', { body: { testId, groupIds: mode === 'groups' ? groupIds : [], userIds: mode === 'students' ? studentIds : [], ...params } }),
          t('assign.created'),
        );
    if (ok) onDone();
  };
  const toggle = (arr: number[], set: (v: number[]) => void, id: number) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const canSubmit = editing || (testId && (mode === 'groups' ? groupIds.length : studentIds.length));

  return (
    <Modal
      wide
      title={editing ? t('assign.editTitle') : t('assign.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!canSubmit}>
            {editing ? t('common.save') : t('assign.submit')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        {!defaults.testId && !editing && (
          <Field label={t('common.test')}>
            <Select value={testId ?? ''} onChange={(e) => setTestId(Number(e.target.value))}>
              {tests.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title} — {x.subject_name}
                </option>
              ))}
            </Select>
            {tests.data && !tests.data.length && <div className="hint">{t('assign.noPublished')}</div>}
          </Field>
        )}
        {!editing && (
          <div>
            <div className="row between mb" style={{ marginBottom: 10 }}>
              <span className="label">{t('assign.targets')}</span>
              <Seg
                value={mode}
                onChange={setMode}
                options={[
                  { id: 'groups', label: t('assign.byGroups') },
                  { id: 'students', label: t('assign.byStudents') },
                ]}
              />
            </div>
            {mode === 'groups' ? (
              <div className="grid g3" style={{ gap: 8 }}>
                {groups.data?.filter((g) => g.status === 'active').map((g) => (
                  <label key={g.id} className={`answer-opt ${groupIds.includes(g.id) ? 'selected' : ''}`} style={{ margin: 0, padding: '10px 12px' }}>
                    <input type="checkbox" checked={groupIds.includes(g.id)} onChange={() => toggle(groupIds, setGroupIds, g.id)} />
                    <span>
                      <b>{g.name}</b>
                      <div className="tiny muted">{t('groups.studentsCount', { n: g.student_count })}</div>
                    </span>
                  </label>
                ))}
                {groups.data && !groups.data.length && <div className="muted small">{t('groups.empty')}</div>}
              </div>
            ) : (
              <div>
                <Input placeholder={t('common.searchStudents')} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                <div style={{ maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
                  {students.data?.items.map((s: any) => (
                    <div key={s.id} style={{ padding: '6px 2px' }}>
                      <Check
                        checked={studentIds.includes(s.id)}
                        onChange={() => toggle(studentIds, setStudentIds, s.id)}
                        label={
                          <span>
                            {s.last_name} {s.first_name} <span className="small muted">{s.groups.map((g: any) => g.name).join(', ')}</span>
                          </span>
                        }
                      />
                    </div>
                  ))}
                </div>
                {studentIds.length > 0 && <div className="small muted mt-sm">{t('assign.selectedN', { n: studentIds.length })}</div>}
              </div>
            )}
          </div>
        )}
        <div className="form-grid">
          <Field label={t('assign.startsAt')}>
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label={t('assign.endsAt')}>
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
          <Field label={t('builder.duration')} hint={t('builder.durationHint')}>
            <Input type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder={t('common.unlimited')} />
          </Field>
          <Field label={t('builder.attempts')}>
            <Input type="number" min={1} max={20} value={attempts} onChange={(e) => setAttempts(e.target.value)} />
          </Field>
          <Field label={t('builder.passScore')}>
            <Input type="number" min={0} max={100} value={pass} onChange={(e) => setPass(e.target.value)} />
          </Field>
        </div>
        <div>
          <ToggleRow title={t('builder.showResult')} hint={t('builder.showResultHint')} checked={showResult} onChange={setShowResult} />
          <ToggleRow title={t('builder.showAnswers')} hint={t('builder.showAnswersHint')} checked={showAnswers} onChange={setShowAnswers} />
        </div>
      </div>
    </Modal>
  );
}

export function AssignmentsTable({ items, onChange, showTest = true }: { items: any[]; onChange: () => void; showTest?: boolean }) {
  const { t } = useI18n();
  const f = useFormat();
  const me = useMe();
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const canEdit = me.role === 'teacher' || me.role === 'admin';
  const stateOf = (a: any) => (Date.parse(a.starts_at) > Date.now() ? 'upcoming' : Date.parse(a.ends_at) < Date.now() ? 'finished' : 'active');
  const tone = { upcoming: 'orange', active: 'blue', finished: 'gray' } as const;
  if (!items.length) return <Empty title={t('assign.empty')} />;
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {showTest && <th>{t('common.test')}</th>}
              <th>{t('assign.target')}</th>
              <th>{t('assign.period')}</th>
              <th>{t('builder.duration')}</th>
              <th>{t('assign.progress')}</th>
              <th>{t('dashboard.avgResult')}</th>
              <th>{t('common.status')}</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const st = stateOf(a);
              return (
                <tr key={a.id}>
                  {showTest && (
                    <td>
                      <Link to={`/app/tests/${a.test_id}`} className="bold">
                        {a.test_title}
                      </Link>
                      <div className="tiny muted">{a.subject_name}</div>
                    </td>
                  )}
                  <td>{a.group_name ?? <span>👤 {a.student_name}</span>}</td>
                  <td className="nowrap small">
                    {f.dateTime(a.starts_at)}
                    <br />
                    {f.dateTime(a.ends_at)}
                  </td>
                  <td>{a.duration_min ? t('common.minutes', { n: a.duration_min }) : '—'}</td>
                  <td className="nowrap">
                    {a.completed_count} / {a.student_count}
                  </td>
                  <td>{a.avg_percentage != null ? <PctBadge value={a.avg_percentage} /> : '—'}</td>
                  <td>
                    <Badge tone={tone[st]}>{t(`assign.state.${st}`)}</Badge>
                  </td>
                  {canEdit && (
                    <td className="nowrap right">
                      <Button size="sm" variant="ghost" className="icon" onClick={() => setEditing(a)} title={t('common.edit')}>
                        <Pencil />
                      </Button>
                      <Button size="sm" variant="ghost" className="icon" onClick={() => setDeleting(a)} title={t('common.delete')} disabled={a.completed_count > 0}>
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <AssignModal
          defaults={{}}
          editing={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}
      {deleting && (
        <Confirm
          danger
          title={t('assign.deleteTitle')}
          text={t('assign.deleteText')}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await del(`/assignments/${deleting.id}`);
            onChange();
          }}
        />
      )}
    </>
  );
}

export function Assignments() {
  const { t } = useI18n();
  const me = useMe();
  const [state, setState] = useState<'' | 'active' | 'upcoming' | 'finished'>('');
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const list = useApi<any[]>('/assignments', { state, search, subjectId, groupId, teacherId });
  const filtered = !!(state || search || subjectId || groupId || teacherId);
  const [creating, setCreating] = useState(false);
  const counts = useMemo(() => list.data?.length ?? 0, [list.data]);
  return (
    <>
      <PageHead
        title={t('nav.assignments')}
        subtitle={t('assign.subtitle')}
        actions={
          me.role !== 'auditor' && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <CalendarPlus /> {t('assign.title')}
            </Button>
          )
        }
      />
      <div className="filters">
        <Seg
          value={state}
          onChange={setState}
          options={[
            { id: '', label: t('common.all') },
            { id: 'active', label: t('assign.state.active') },
            { id: 'upcoming', label: t('assign.state.upcoming') },
            { id: 'finished', label: t('assign.state.finished') },
          ]}
        />
        <Input className="search-input" placeholder={t('filters.searchAssignments')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <SubjectSelect value={subjectId} onChange={setSubjectId} />
        <GroupSelect value={groupId} onChange={setGroupId} />
        {me.role !== 'teacher' && <TeacherSelect value={teacherId} onChange={setTeacherId} />}
        <ResetFilters
          active={filtered}
          onReset={() => {
            setState('');
            setSearch('');
            setSubjectId('');
            setGroupId('');
            setTeacherId('');
          }}
        />
        <span className="small muted">{t('common.totalN', { n: counts })}</span>
      </div>
      <Card flush>
        <Loader state={list}>{(items) => <AssignmentsTable items={items} onChange={list.reload} />}</Loader>
      </Card>
      {creating && (
        <AssignModal
          defaults={{}}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}
