import { Camera, LogOut, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, del, fileToBase64, patch, useApi } from '../api';
import { useAuth, useMe } from '../auth';
import { Avatar, Badge, Button, Card, Check, Field, Input, Loader, PageHead, Select, errorText, useAction, useToast } from '../components/ui';
import { useFormat, useI18n, type Lang } from '../i18n';

export function Profile() {
  const me = useMe();
  const { refresh } = useAuth();
  const teacherReq = useAction();
  const { t, lang, setLang } = useI18n();
  const f = useFormat();
  const toast = useToast();
  const profile = useApi<any>('/profile');
  const sessions = useApi<any[]>('/auth/sessions');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [pw, setPw] = useState({ current: '', next: '', logoutOthers: true });
  const save = useAction();
  const pwAction = useAction();

  useEffect(() => {
    if (profile.data) setForm({ firstName: profile.data.first_name, lastName: profile.data.last_name, email: profile.data.email ?? '' });
  }, [profile.data]);

  const onAvatar = async (file?: File) => {
    if (!file) return;
    try {
      await api('/profile/avatar', { body: { data: await fileToBase64(file) } });
      await refresh();
      profile.reload();
    } catch (e) {
      toast(errorText(t, e), 'error');
    }
  };

  return (
    <>
      <PageHead title={t('nav.profile')} subtitle={t('profile.subtitle')} />
      <Loader state={profile}>
        {(p) => (
          <div className="grid g2">
            <Card title={t('profile.info')}>
              <div className="row mb">
                <label style={{ position: 'relative', cursor: 'pointer' }} title={t('profile.changePhoto')}>
                  <Avatar name={`${p.first_name} ${p.last_name}`} url={p.avatar_url} size={72} />
                  <span className="icon-btn" style={{ position: 'absolute', right: -4, bottom: -4, background: 'var(--surface)', width: 30, height: 30, boxShadow: 'var(--shadow)' }}>
                    <Camera size={15} />
                  </span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
                </label>
                <div>
                  <h2>
                    {p.first_name} {p.last_name}
                  </h2>
                  <div className="row gap-sm mt-sm">
                    <Badge tone="blue">{t(`role.${p.role}`)}</Badge>
                    <Badge tone="green">{t(`userStatus.${p.status}`)}</Badge>
                  </div>
                </div>
              </div>
              <div className="form-grid">
                <Field label={t('profile.firstName')}>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </Field>
                <Field label={t('profile.lastName')}>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label={t('auth.phone')} hint={t('profile.phoneHint')}>
                  <Input value={p.phone ?? '—'} disabled />
                </Field>
                <Field label={t('profile.language')}>
                  <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                    <option value="ru">Русский</option>
                    <option value="uz">O'zbekcha</option>
                  </Select>
                </Field>
              </div>
              <dl className="kv mt">
                <dt>{t('nav.groups')}</dt>
                <dd>{p.groups.map((g: any) => g.name).join(', ') || '—'}</dd>
                {p.role === 'teacher' && (
                  <>
                    <dt>{t('users.subjectsTaught')}</dt>
                    <dd>{p.subjects.map((s: any) => s.name).join(', ') || '—'}</dd>
                  </>
                )}
                <dt>{t('profile.registered')}</dt>
                <dd>{f.date(p.created_at)}</dd>
                <dt>Google</dt>
                <dd>{p.has_google ? t('profile.googleLinked') : t('common.no')}</dd>
              </dl>
              {p.role === 'teacher' && <div className="alert info mt">{t('profile.assignedByAdmin')}</div>}
              {p.role === 'student' &&
                (me.requested_role === 'teacher' ? (
                  <div className="alert warning mt">{t('student.teacherRequestPending')}</div>
                ) : (
                  <div className="alert info mt" style={{ alignItems: 'center' }}>
                    <span className="grow">{t('profile.teacherRequestText')}</span>
                    <Button
                      size="sm"
                      loading={teacherReq.busy}
                      onClick={async () => {
                        const r = await teacherReq.run(() => api('/profile/teacher-request', { method: 'POST' }), t('profile.teacherRequestSent'));
                        if (r) refresh();
                      }}
                    >
                      {t('profile.teacherRequestBtn')}
                    </Button>
                  </div>
                ))}
              <div className="row mt" style={{ justifyContent: 'flex-end' }}>
                <Button
                  variant="primary"
                  loading={save.busy}
                  onClick={async () => {
                    const r = await save.run(() => patch('/profile', { ...form, language: lang }), t('common.saved'));
                    if (r) refresh();
                  }}
                >
                  {t('common.save')}
                </Button>
              </div>
            </Card>
            <div className="stack">
              <Card title={me.has_password ? t('profile.changePassword') : t('profile.setPassword')}>
                <div className="stack" style={{ gap: 12 }}>
                  {!!me.has_password && (
                    <Field label={t('profile.currentPassword')}>
                      <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
                    </Field>
                  )}
                  <Field label={t('auth.newPassword')}>
                    <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
                  </Field>
                  <Check checked={pw.logoutOthers} onChange={(v) => setPw({ ...pw, logoutOthers: v })} label={t('profile.logoutOthers')} />
                  <Button
                    variant="primary"
                    loading={pwAction.busy}
                    disabled={!pw.next}
                    onClick={async () => {
                      const r = await pwAction.run(() => api('/auth/password', { body: pw }), t('profile.passwordChanged'));
                      if (r) {
                        setPw({ current: '', next: '', logoutOthers: true });
                        sessions.reload();
                        refresh();
                      }
                    }}
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </Card>
              <Card
                title={t('profile.sessions')}
                action={
                  <Button size="sm" onClick={() => api('/auth/sessions/revoke-others', { method: 'POST' }).then(sessions.reload)}>
                    <LogOut /> {t('profile.endOthers')}
                  </Button>
                }
              >
                <Loader state={sessions}>
                  {(list) =>
                    list.map((s) => (
                      <div className="list-item" key={s.id}>
                        <div className="list-icon tone-gray">
                          <Monitor />
                        </div>
                        <div className="grow">
                          <div className="small bold ellipsis" title={s.user_agent}>
                            {(s.user_agent ?? '').slice(0, 60) || '—'}
                          </div>
                          <div className="tiny muted">
                            {s.ip} · {t('profile.lastSeen')}: {f.dateTime(s.last_seen_at)}
                          </div>
                        </div>
                        {s.current ? (
                          <Badge tone="green">{t('profile.thisDevice')}</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => del(`/auth/sessions/${s.id}`).then(sessions.reload)}>
                            {t('profile.end')}
                          </Button>
                        )}
                      </div>
                    ))
                  }
                </Loader>
              </Card>
            </div>
          </div>
        )}
      </Loader>
    </>
  );
}
