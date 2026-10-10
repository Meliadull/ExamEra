import { BarChart3, CheckCircle2, Clock, FileSpreadsheet, ScrollText, Smartphone, Sparkles, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { LangSwitch } from '../components/Layout';
import { Logo } from '../components/Logo';
import { Badge, Progress } from '../components/ui';
import { useI18n } from '../i18n';
import { ThemeToggle } from '../theme';

export function Landing() {
  const { t } = useI18n();
  const { user } = useAuth();
  const features = [
    { icon: <Sparkles />, tone: 'blue', k: 'f1' },
    { icon: <Clock />, tone: 'orange', k: 'f2' },
    { icon: <BarChart3 />, tone: 'green', k: 'f3' },
    { icon: <FileSpreadsheet />, tone: 'purple', k: 'f4' },
    { icon: <ScrollText />, tone: 'red', k: 'f5' },
    { icon: <Smartphone />, tone: 'blue', k: 'f6' },
  ];
  const flow = ['flow1', 'flow2', 'flow3', 'flow4', 'flow5', 'flow6'];
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo style={{ padding: 0 }} />
        <div className="row" style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
          <LangSwitch />
          {user ? (
            <Link to="/app" className="btn primary">
              {t('landing.openApp')}
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn ghost">
                {t('auth.signIn')}
              </Link>
              <Link to="/register" className="btn primary">
                {t('auth.register')}
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div>
          <Badge tone="blue">{t('landing.badge')}</Badge>
          <h1 style={{ marginTop: 16 }}>
            {t('landing.heroTitle1')} <span>{t('landing.heroTitle2')}</span>
          </h1>
          <p>{t('landing.heroText')}</p>
          <div className="row wrap">
            <Link to={user ? '/app' : '/register'} className="btn primary lg">
              {t('landing.start')}
            </Link>
            <Link to="/login" className="btn lg">
              {t('auth.signIn')}
            </Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="row between mb">
            <div>
              <div className="bold">{t('landing.mockTitle')}</div>
              <div className="small muted">{t('landing.mockSub')}</div>
            </div>
            <div className="timer" style={{ fontSize: 18 }}>
              <Clock /> 18:32
            </div>
          </div>
          <div className="row between small muted mb" style={{ marginBottom: 8 }}>
            <span>{t('take.questionOf', { n: 8, total: 20 })}</span>
            <span>40%</span>
          </div>
          <Progress value={40} />
          <div className="q-text" style={{ marginTop: 18 }}>
            2(x − 3) = 10
          </div>
          {['x = 2', 'x = 3', 'x = 8', 'x = 5'].map((o, i) => (
            <div key={o} className={`answer-opt ${i === 2 ? 'selected' : ''}`} style={{ padding: '11px 14px' }}>
              <input type="radio" readOnly checked={i === 2} /> {o}
            </div>
          ))}
          <div className="grid g3 mt" style={{ gap: 10 }}>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row gap-sm small muted">
                <Trophy size={15} /> {t('landing.mockAvg')}
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>78%</div>
            </div>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row gap-sm small muted">
                <Users size={15} /> {t('nav.students')}
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>248</div>
            </div>
            <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
              <div className="row gap-sm small muted">
                <CheckCircle2 size={15} /> {t('landing.mockDone')}
              </div>
              <div className="stat-value" style={{ fontSize: 20 }}>186</div>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        {features.map((f) => (
          <div className="feature" key={f.k}>
            <div className={`stat-icon tone-${f.tone}`}>{f.icon}</div>
            <h3>{t(`landing.${f.k}Title`)}</h3>
            <p>{t(`landing.${f.k}Text`)}</p>
          </div>
        ))}
      </section>

      <section className="flow">
        <h2 className="center mb" style={{ fontSize: 24 }}>
          {t('landing.flowTitle')}
        </h2>
        <div className="flow-steps">
          {flow.map((k, i) => (
            <span key={k} className="row gap-sm">
              <Badge tone="blue">
                {i + 1}. {t(`landing.${k}`)}
              </Badge>
              {i < flow.length - 1 && <span className="faint">→</span>}
            </span>
          ))}
        </div>
      </section>
      <footer className="footer">© {new Date().getFullYear()} ExamEra · {t('landing.footer')}</footer>
    </div>
  );
}
