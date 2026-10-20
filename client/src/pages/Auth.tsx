import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthHero } from '../components/AuthHero';
import { LangSwitch } from '../components/Layout';
import { Logo } from '../components/Logo';
import { Button, Check, ErrorBox, Field, Input, Seg } from '../components/ui';
import { useI18n } from '../i18n';
import { ThemeToggle } from '../theme';

declare global {
  interface Window {
    google?: any;
  }
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <AuthHero />
      <div className="auth-form-wrap">
        <div className="auth-form">
          <div className="row between mb">
            <Logo style={{ padding: 0 }} />
            <div className="row gap-sm">
              <ThemeToggle />
              <LangSwitch />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

let gsiPromise: Promise<void> | null = null;
function loadGsi() {
  gsiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gsi'));
    document.head.appendChild(s);
  });
  return gsiPromise;
}

function GoogleButton({ remember, onError }: { remember: boolean; onError: (e: unknown) => void }) {
  const { config, setSession } = useAuth();
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const rememberRef = useRef(remember);
  rememberRef.current = remember;

  useEffect(() => {
    if (!config?.googleClientId) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (resp: { credential: string }) => {
            try {
              setSession(await api('/auth/google', { body: { credential: resp.credential, remember: rememberRef.current } }));
              nav('/app');
            } catch (e) {
              onError(e);
            }
          },
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          width: ref.current.offsetWidth || 360,
          text: 'continue_with',
          locale: lang === 'uz' ? 'uz' : 'ru',
        });
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [config?.googleClientId, lang, nav, onError, setSession]);

  if (!config?.googleClientId) {
    return (
      <Button block disabled title={t('auth.googleNotConfigured')}>
        <GoogleIcon /> {t('auth.continueGoogle')}
      </Button>
    );
  }
  return <div ref={ref} className="google-btn" />;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function DevCode({ code }: { code?: string }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <div className="alert warning mb">
      <KeyRound />
      <span>
        {t('auth.devCode')}: <b className="mono" style={{ fontSize: 15 }}>{code}</b>
      </span>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const { setSession, config } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api('/auth/login', { body: { login, password, remember } }));
      nav(loc.state?.from ?? '/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>
        {t('auth.welcome')} <span style={{ color: 'var(--primary)' }}>{config?.platformName ?? 'ExamEra'}</span>
      </h1>
      <p className="sub">{t('auth.loginSubtitle')}</p>
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <Field label={t('auth.phoneOrEmail')}>
          <Input autoComplete="username" placeholder="+998 90 123 45 67" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </Field>
        <Field
          label={
            <span className="row between">
              {t('auth.password')}
              <Link to="/recover" className="small" style={{ fontWeight: 500 }}>
                {t('auth.forgot')}
              </Link>
            </span>
          }
        >
          <Input type="password" autoComplete="current-password" placeholder={t('auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Check checked={remember} onChange={setRemember} label={t('auth.remember')} />
        <ErrorBox error={error} />
        <Button type="submit" variant="primary" block size="lg" loading={busy}>
          {t('auth.signIn')}
        </Button>
      </form>
      <div className="divider">{t('common.or')}</div>
      <GoogleButton remember={remember} onError={setError} />
      {config?.registrationEnabled !== false && (
        <p className="center small muted mt">
          {t('auth.noAccount')} <Link to="/register">{t('auth.register')}</Link>
        </p>
      )}
      <DemoAccounts onPick={(l) => { setLogin(l); setPassword('Demo1234'); }} />
    </AuthShell>
  );
}

function DemoAccounts({ onPick }: { onPick: (login: string) => void }) {
  const { t } = useI18n();
  const { config } = useAuth();
  // Only accounts that still use the public demo password are offered.
  const list = config?.demoAccounts ?? [];
  if (!list.length) return null;
  return (
    <div className="card mt" style={{ padding: 14, boxShadow: 'none', background: 'var(--surface-2)' }}>
      <div className="small bold mb" style={{ marginBottom: 8 }}>
        {t('auth.demoAccounts')}
      </div>
      <div className="row wrap gap-sm">
        {list.map((a) => (
          <button key={a.login} type="button" className="btn sm" onClick={() => onPick(a.login)} title={a.name}>
            {t(`role.${a.role}`)} <span className="muted" style={{ fontWeight: 500 }}>· {a.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Register() {
  const { t } = useI18n();
  const { setSession, config } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', password: '', confirm: '' });
  const [as, setAs] = useState<'student' | 'teacher'>('student');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (form.password !== form.confirm) return setMismatch(true);
    setMismatch(false);
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/otp', { body: { phone: form.phone, purpose: 'register' } });
      setDevCode(r.devCode);
      setStep(2);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api('/auth/register', { body: { ...form, code, remember: true, asTeacher: as === 'teacher' } }));
      nav('/app', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (config && !config.registrationEnabled) {
    return (
      <AuthShell>
        <div className="alert warning">{t('errors.registration_disabled')}</div>
        <p className="center mt">
          <Link to="/login">{t('auth.signIn')}</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1>{t('auth.createAccount')}</h1>
      <p className="sub">{step === 1 ? t('auth.registerSubtitle') : t('auth.otpSent', { phone: form.phone })}</p>
      {step === 1 ? (
        <form onSubmit={sendCode} className="stack" style={{ gap: 14 }}>
          <Field label={t('auth.registerAs')} hint={as === 'teacher' ? t('auth.teacherHint') : undefined}>
            <Seg
              value={as}
              onChange={setAs}
              options={[
                { id: 'student', label: t('role.student') },
                { id: 'teacher', label: t('role.teacher') },
              ]}
            />
          </Field>
          <div className="form-grid">
            <Field label={t('profile.firstName')}>
              <Input value={form.firstName} onChange={set('firstName')} required maxLength={60} autoComplete="given-name" />
            </Field>
            <Field label={t('profile.lastName')}>
              <Input value={form.lastName} onChange={set('lastName')} required maxLength={60} autoComplete="family-name" />
            </Field>
          </div>
          <Field label={t('auth.phone')}>
            <Input type="tel" placeholder="+998 90 123 45 67" value={form.phone} onChange={set('phone')} required autoComplete="tel" />
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint', { min: config?.minPasswordLength ?? 8 })}>
            <Input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
          </Field>
          <Field label={t('auth.confirmPassword')} error={mismatch ? t('auth.passwordsMismatch') : undefined}>
            <Input type="password" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" className={mismatch ? 'invalid' : ''} />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" variant="primary" block size="lg" loading={busy}>
            {t('auth.getCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="stack" style={{ gap: 14 }}>
          <DevCode code={devCode} />
          <Field label={t('auth.smsCode')}>
            <Input inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }} />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" variant="primary" block size="lg" loading={busy}>
            <ShieldCheck /> {t('auth.confirmRegister')}
          </Button>
          <div className="row between small">
            <button type="button" className="btn ghost sm" onClick={() => setStep(1)}>
              {t('common.back')}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => sendCode()} disabled={busy}>
              {t('auth.resend')}
            </button>
          </div>
        </form>
      )}
      <div className="divider">{t('common.or')}</div>
      <GoogleButton remember onError={setError} />
      <p className="center small muted mt">
        {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
      </p>
    </AuthShell>
  );
}

export function Recover() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [devCode, setDevCode] = useState<string>();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/otp', { body: { phone, purpose: 'recover' } });
      setDevCode(r.devCode);
      setStep(2);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const reset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/recover', { body: { phone, code, password } });
      setStep(3);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <h1>{t('auth.recoverTitle')}</h1>
      <p className="sub">{t('auth.recoverSubtitle')}</p>
      {step === 1 && (
        <form onSubmit={send} className="stack" style={{ gap: 14 }}>
          <Field label={t('auth.phone')}>
            <Input type="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" variant="primary" block size="lg" loading={busy}>
            {t('auth.getCode')}
          </Button>
        </form>
      )}
      {step === 2 && (
        <form onSubmit={reset} className="stack" style={{ gap: 14 }}>
          <div className="alert info">{t('auth.recoverCodeSent')}</div>
          <DevCode code={devCode} />
          <Field label={t('auth.smsCode')}>
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required style={{ letterSpacing: 6, fontSize: 18, textAlign: 'center' }} />
          </Field>
          <Field label={t('auth.newPassword')}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" variant="primary" block size="lg" loading={busy}>
            {t('auth.resetPassword')}
          </Button>
        </form>
      )}
      {step === 3 && (
        <div className="stack">
          <div className="alert success">
            <CheckCircle2 /> {t('auth.passwordResetDone')}
          </div>
          <Button variant="primary" block size="lg" onClick={() => nav('/login')}>
            {t('auth.signIn')}
          </Button>
        </div>
      )}
      <p className="center small muted mt">
        <Link to="/login">{t('auth.backToLogin')}</Link>
      </p>
    </AuthShell>
  );
}
