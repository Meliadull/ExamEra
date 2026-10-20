import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, del, patch, put, useApi } from '../api';
import { useMe } from '../auth';
import { matchesSearch, ResetFilters, useSubjects } from '../components/common';
import { Button, Card, Check, Confirm, Empty, Field, Input, Loader, Modal, PageHead, PctBadge, Select, Textarea, useAction } from '../components/ui';
import { useI18n } from '../i18n';
import type { Subject } from '../types';

function SubjectForm({ subject, onClose, onDone }: { subject?: Subject; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const me = useMe();
  const [name, setName] = useState(subject?.name ?? '');
  const [description, setDescription] = useState(subject?.description ?? '');
  const teachers = useApi<any>(me.role === 'admin' ? '/users' : null, { role: 'teacher', pageSize: 200 });
  const [teacherIds, setTeacherIds] = useState<number[] | null>(null);
  const { busy, run } = useAction();
  const submit = async () => {
    const body = { name, description };
    const ok = await run(async () => {
      const r = subject ? await patch(`/subjects/${subject.id}`, body) : await api('/subjects', { body });
      const sid = subject?.id ?? r.id;
      if (teacherIds && me.role === 'admin') await put(`/subjects/${sid}/teachers`, { userIds: teacherIds });
      return true;
    }, t('common.saved'));
    if (ok) onDone();
  };
  const currentTeachers = teacherIds ?? (teachers.data?.items ?? []).filter((u: any) => subject?.teachers?.includes(`${u.first_name} ${u.last_name}`)).map((u: any) => u.id);
  return (
    <Modal
      title={subject ? t('subjects.edit') : t('subjects.create')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <Field label={t('subjects.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label={t('builder.description')}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 60 }} />
        </Field>
        {me.role === 'admin' && (
          <Field label={t('groups.teachers')}>
            <div className="stack" style={{ gap: 6 }}>
              {teachers.data?.items.map((u: any) => (
                <Check
                  key={u.id}
                  checked={currentTeachers.includes(u.id)}
                  onChange={() => setTeacherIds(currentTeachers.includes(u.id) ? currentTeachers.filter((x: number) => x !== u.id) : [...currentTeachers, u.id])}
                  label={`${u.last_name} ${u.first_name}`}
                />
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/** The teacher of a subject maintains its topics (suggested when creating tests, used for weak-topic analytics). */
function TopicsForm({ subject, onClose, onDone }: { subject: Subject; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [topics, setTopics] = useState<string[]>(subject.topics);
  const [topic, setTopic] = useState('');
  const { busy, run } = useAction();
  const addTopic = () => {
    const v = topic.trim();
    if (v && !topics.includes(v)) setTopics([...topics, v]);
    setTopic('');
  };
  return (
    <Modal
      title={`${t('subjects.topics')}: ${subject.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const ok = await run(() => put(`/subjects/${subject.id}/topics`, { topics }), t('common.saved'));
              if (ok) onDone();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <p className="small muted" style={{ marginTop: 0 }}>
        {t('subjects.topicsHint')}
      </p>
      <div className="row">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
          placeholder={t('subjects.topicPlaceholder')}
          autoFocus
        />
        <Button onClick={addTopic} aria-label={t('common.add')}>
          <Plus />
        </Button>
      </div>
      <div className="chip-list mt">
        {topics.length ? (
          topics.map((x) => (
            <span className="chip" key={x}>
              {x}
              <button onClick={() => setTopics(topics.filter((y) => y !== x))} aria-label={`${t('common.remove')}: ${x}`}>
                <X size={13} />
              </button>
            </span>
          ))
        ) : (
          <span className="small muted">{t('subjects.noTopics')}</span>
        )}
      </div>
    </Modal>
  );
}

export function Subjects() {
  const { t } = useI18n();
  const me = useMe();
  const list = useSubjects(me.role === 'teacher');
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const [topicsOf, setTopicsOf] = useState<Subject | null>(null);
  const [search, setSearch] = useState('');
  const [staffing, setStaffing] = useState('');
  const isAdmin = me.role === 'admin';
  const filtered = !!(search || staffing);
  return (
    <>
      <PageHead
        title={t('nav.subjects')}
        subtitle={me.role === 'teacher' ? t('subjects.teacherSubtitle') : t('subjects.subtitle')}
        actions={
          isAdmin && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus /> {t('subjects.create')}
            </Button>
          )
        }
      />
      {me.role === 'teacher' && <div className="alert info mb">{t('subjects.adminManaged')}</div>}
      {me.role !== 'teacher' || (list.data?.length ?? 0) > 3 ? (
        <div className="filters">
          <Input className="search-input" placeholder={t('filters.searchSubjects')} value={search} onChange={(e) => setSearch(e.target.value)} />
          {me.role !== 'teacher' && (
            <Select value={staffing} onChange={(e) => setStaffing(e.target.value)} aria-label={t('groups.teachers')}>
              <option value="">{t('filters.anyTeacher')}</option>
              <option value="with">{t('filters.withTeacher')}</option>
              <option value="without">{t('filters.withoutTeacher')}</option>
            </Select>
          )}
          <ResetFilters
            active={filtered}
            onReset={() => {
              setSearch('');
              setStaffing('');
            }}
          />
        </div>
      ) : null}
      <Loader state={list}>
        {(all) => {
          const items = all.filter(
            (s) =>
              (!staffing || (staffing === 'with') === !!s.teachers) &&
              matchesSearch(search, s.name, s.description, ...s.topics),
          );
          return items.length ? (
            <div className="grid g3">
              {items.map((s) => {
                return (
                  <Card key={s.id}>
                    <div className="row between" style={{ alignItems: 'flex-start' }}>
                      <div className="row">
                        <div className="list-icon tone-purple">
                          <BookOpen />
                        </div>
                        <div>
                          <h3>{s.name}</h3>
                          <div className="small muted">{t('subjects.testsN', { n: s.test_count })}</div>
                        </div>
                      </div>
                      {s.avg_percentage != null && <PctBadge value={s.avg_percentage} />}
                    </div>
                    {s.description && <p className="small muted" style={{ margin: '10px 0 0' }}>{s.description}</p>}
                    {s.topics.length > 0 && (
                      <div className="chip-list mt-sm">
                        {s.topics.map((x) => (
                          <span className="chip" key={x}>
                            {x}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="tiny muted mt-sm">
                      {[s.teachers && `${t('groups.teachers')}: ${s.teachers}`, s.groups].filter(Boolean).join(' · ')}
                    </div>
                    {me.role === 'teacher' && (
                      <div className="row mt-sm" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setTopicsOf(s)}>
                          <Pencil /> {t('subjects.topics')}
                        </Button>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="row mt-sm" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                          <Pencil /> {t('common.edit')}
                        </Button>
                        {s.test_count === 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(s)}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <Empty title={filtered && all.length ? t('common.nothingFound') : me.role === 'teacher' ? t('subjects.noneAssigned') : t('subjects.empty')} />
            </Card>
          );
        }}
      </Loader>
      {editing && (
        <SubjectForm
          subject={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
      {topicsOf && (
        <TopicsForm
          subject={topicsOf}
          onClose={() => setTopicsOf(null)}
          onDone={() => {
            setTopicsOf(null);
            list.reload();
          }}
        />
      )}
      {deleting && (
        <Confirm
          danger
          title={t('subjects.delete')}
          text={t('subjects.deleteText', { name: deleting.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await del(`/subjects/${deleting.id}`);
            list.reload();
          }}
        />
      )}
    </>
  );
}
