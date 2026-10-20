import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { LangSwitch } from '../components/Layout';
import { Logo } from '../components/Logo';
import { useI18n } from '../i18n';
import { ThemeToggle } from '../theme';
import './landing.css';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Adds `.in` to every [data-reveal] element once it scrolls into view. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? []);
    if (!('IntersectionObserver' in window) || reducedMotion()) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

/** Counts from 0 to `to` once the number becomes visible. */
function CountUp({ to, suffix = '', duration = 1600, delay = 0 }: { to: number; suffix?: string; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      setVal(to);
      return;
    }
    let raf = 0;
    let timer = 0;
    const run = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      // Frames may not render in a background tab: make sure the final value is shown.
      timer = window.setTimeout(() => setVal(to), duration + 400);
    };
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      timer = window.setTimeout(run, delay);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [to, duration, delay]);
  return (
    <span ref={ref} className="l-num">
      {val}
      {suffix}
    </span>
  );
}

const DEMO_QUESTIONS = [
  { q: '2(x − 3) = 10', options: ['x = 2', 'x = 3', 'x = 8', 'x = 5'], correct: 2 },
  { q: '3x + 4 = 19', options: ['x = 3', 'x = 5', 'x = 7', 'x = 4'], correct: 1 },
  { q: 'x² = 49,  x > 0', options: ['x = 6', 'x = 9', 'x = 8', 'x = 7'], correct: 3 },
];
const TOTAL = 20;

/** The test-taking mock in the hero: a live timer, answers being picked, progress moving on. */
function LiveTestCard() {
  const { t } = useI18n();
  const [seconds, setSeconds] = useState(18 * 60 + 32);
  const [step, setStep] = useState(0); // question index (cycles)
  const [picked, setPicked] = useState<number | null>(null);
  const [tilt, setTilt] = useState<CSSProperties>({});

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => (s > 60 ? s - 1 : 18 * 60 + 32)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (reducedMotion()) {
      setPicked(DEMO_QUESTIONS[0].correct);
      return;
    }
    const q = DEMO_QUESTIONS[step % DEMO_QUESTIONS.length];
    const a = window.setTimeout(() => setPicked(q.correct), 1500);
    const b = window.setTimeout(() => {
      setPicked(null);
      setStep((s) => (s + 1) % 9);
    }, 3300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [step]);

  const q = DEMO_QUESTIONS[step % DEMO_QUESTIONS.length];
  const n = 8 + step;
  const pct = Math.round(((n - 1 + (picked !== null ? 1 : 0)) / TOTAL) * 100);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ transform: `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg)` });
  };

  return (
    <div className="l-stage" onMouseMove={onMove} onMouseLeave={() => setTilt({})} aria-hidden="true">
      <div className="l-card-wrap" style={tilt}>
        <div className="l-mock">
          <div className="l-mock-head">
            <div>
              <div className="bold">{t('landing.mockTitle')}</div>
              <div className="small muted">{t('landing.mockSub')}</div>
            </div>
            <div className="l-timer">
              <Clock size={16} /> {mm}:{ss}
            </div>
          </div>
          <div className="l-mock-progress">
            <span>{t('take.questionOf', { n, total: TOTAL })}</span>
            <span>{pct}%</span>
          </div>
          <div className="l-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="l-question" key={step}>
            <div className="l-q-text">{q.q}</div>
            {q.options.map((o, i) => (
              <div
                key={o}
                className={`l-opt ${picked === i ? 'picked' : ''}`}
                style={{ '--i': i } as CSSProperties}
              >
                <span className="l-radio" />
                {o}
                {picked === i && <CheckCircle2 className="l-opt-ok" size={17} />}
              </div>
            ))}
          </div>
          <div className="l-mini-stats">
            <div>
              <span className="l-mini-label">
                <Trophy size={14} /> {t('landing.mockAvg')}
              </span>
              <b>
                <CountUp to={78} suffix="%" delay={600} />
              </b>
            </div>
            <div>
              <span className="l-mini-label">
                <Users size={14} /> {t('nav.students')}
              </span>
              <b>
                <CountUp to={248} delay={750} />
              </b>
            </div>
            <div>
              <span className="l-mini-label">
                <CheckCircle2 size={14} /> {t('landing.mockDone')}
              </span>
              <b>
                <CountUp to={186} delay={900} />
              </b>
            </div>
          </div>
        </div>

        <div className="l-float l-float-a">
          <span className="l-float-icon green">
            <ShieldCheck size={18} />
          </span>
          <div>
            <b>{t('landing.chipChecked')}</b>
            <span>0.2 s</span>
          </div>
        </div>
        <div className="l-float l-float-b">
          <span className="l-float-icon violet">
            <TrendingUp size={18} />
          </span>
          <div>
            <b>+12%</b>
            <span>{t('landing.chipTrend')}</span>
          </div>
        </div>
        <div className="l-float l-float-c">
          <span className="l-score">
            <CountUp to={92} suffix="%" delay={1100} />
          </span>
          <span>{t('landing.chipScore')}</span>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const { t } = useI18n();
  const { user } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  const features = [
    { icon: <Sparkles />, k: 'f1' },
    { icon: <Clock />, k: 'f2' },
    { icon: <BarChart3 />, k: 'f3' },
    { icon: <FileSpreadsheet />, k: 'f4' },
    { icon: <ScrollText />, k: 'f5' },
    { icon: <Smartphone />, k: 'f6' },
  ];
  const subjects = t('landing.subjects').split('|');
  const flow = ['flow1', 'flow2', 'flow3', 'flow4', 'flow5', 'flow6'];
  const words = t('landing.heroTitle1').split(' ');

  // Spotlight that follows the cursor on feature cards.
  const spot = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <div className="landing" ref={root}>
      <header className="l-hero l-dark">
        <div className="l-bg" aria-hidden="true">
          <span className="l-orb o1" />
          <span className="l-orb o2" />
          <span className="l-orb o3" />
          <span className="l-grid" />
        </div>

        <nav className="l-nav">
          <Logo onDark style={{ padding: 0 }} />
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
                <Link to="/register" className="btn primary l-hide-xs">
                  {t('auth.register')}
                </Link>
              </>
            )}
          </div>
        </nav>

        <section className="l-hero-grid">
          <div className="l-hero-text">
            <span className="l-pill l-enter" style={{ '--d': '0ms' } as CSSProperties}>
              <span className="l-pulse" />
              {t('landing.badge')}
            </span>
            <h1>
              {words.map((w, i) => (
                <span key={i} className="l-word l-enter" style={{ '--d': `${120 + i * 70}ms` } as CSSProperties}>
                  {w}{' '}
                </span>
              ))}
              <span className="l-gradient-text l-enter" style={{ '--d': `${160 + words.length * 70}ms` } as CSSProperties}>
                {t('landing.heroTitle2')}
              </span>
            </h1>
            <p className="l-enter" style={{ '--d': '650ms' } as CSSProperties}>
              {t('landing.heroText')}
            </p>
            <div className="row wrap l-enter" style={{ '--d': '800ms' } as CSSProperties}>
              <Link to={user ? '/app' : '/register'} className="btn primary lg l-cta">
                {t('landing.start')} <ArrowRight />
              </Link>
              <Link to="/login" className="btn lg l-btn-glass">
                {t('auth.signIn')}
              </Link>
            </div>
          </div>
          <div className="l-enter l-enter-right" style={{ '--d': '350ms' } as CSSProperties}>
            <LiveTestCard />
          </div>
        </section>
      </header>

      <section className="l-subjects" aria-label={t('landing.subjectsTitle')}>
        <p className="l-subjects-title" data-reveal>
          {t('landing.subjectsTitle')}
        </p>
        {[subjects, [...subjects].reverse()].map((row, r) => (
          <div key={r} className={`l-marquee ${r ? 'reverse' : ''}`} aria-hidden={r ? 'true' : undefined}>
            {/* The row is rendered twice so the loop has no seam. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="l-marquee-track" aria-hidden={copy ? 'true' : undefined}>
                {row.map((s, i) => (
                  <span key={s} className={`l-subject c${(i + r * 3) % 5}`}>
                    <BookOpen size={15} /> {s}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="l-section">
        <h2 className="l-h2" data-reveal>
          {t('landing.featuresTitle')}
        </h2>
        <div className="l-features">
          {features.map((f, i) => (
            <article
              key={f.k}
              className="l-feature"
              data-reveal
              style={{ '--d': `${(i % 3) * 110}ms` } as CSSProperties}
              onMouseMove={spot}
            >
              <div className="l-feature-icon">{f.icon}</div>
              <h3>{t(`landing.${f.k}Title`)}</h3>
              <p>{t(`landing.${f.k}Text`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="l-flow l-dark">
        <div className="l-bg" aria-hidden="true">
          <span className="l-orb o2" />
          <span className="l-grid" />
        </div>
        <h2 className="l-h2" data-reveal>
          {t('landing.flowTitle')}
        </h2>
        <ol className="l-timeline" data-reveal>
          {flow.map((k, i) => (
            <li key={k} style={{ '--i': i } as CSSProperties}>
              <span className="l-node">{i + 1}</span>
              <span className="l-node-label">{t(`landing.${k}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-section">
        <div className="l-cta-box" data-reveal>
          <div>
            <h2>{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaText')}</p>
          </div>
          <Link to={user ? '/app' : '/register'} className="btn lg l-cta-light">
            {user ? t('landing.openApp') : t('landing.start')} <ArrowRight />
          </Link>
        </div>
      </section>

      <footer className="l-footer">
        © {new Date().getFullYear()} ExamEra · {t('landing.footer')}
      </footer>
    </div>
  );
}
