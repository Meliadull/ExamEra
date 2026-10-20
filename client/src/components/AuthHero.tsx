import { BarChart3, CheckCircle2, GraduationCap, ShieldCheck } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n';
import { Logo } from './Logo';
import './auth-hero.css';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

const SPARKS = [
  { x: 12, y: 18, d: 0 },
  { x: 34, y: 8, d: 1.4 },
  { x: 58, y: 22, d: 2.6 },
  { x: 86, y: 12, d: 0.8 },
  { x: 74, y: 46, d: 3.1 },
  { x: 92, y: 68, d: 1.9 },
  { x: 48, y: 86, d: 0.4 },
  { x: 20, y: 74, d: 2.2 },
  { x: 64, y: 64, d: 3.6 },
];

/**
 * Left side of the sign-in / sign-up / recovery pages: brand, headline, feature list and
 * purely decorative animated cards. Nothing here is interactive; the forms live on the right.
 */
export function AuthHero() {
  const { t } = useI18n();
  return (
    <div className="auth-side examera-hero">
      <div className="examera-hero-bg" aria-hidden="true">
        <span className="examera-hero-glow examera-hero-g1" />
        <span className="examera-hero-glow examera-hero-g2" />
        <span className="examera-hero-glow examera-hero-g3" />
        <span className="examera-hero-shape examera-hero-circle" />
        <span className="examera-hero-shape examera-hero-square" />
        <span className="examera-hero-shape examera-hero-circle examera-hero-circle-sm" />
        <span className="examera-hero-line examera-hero-l1" />
        <span className="examera-hero-line examera-hero-l2" />
        {SPARKS.map((s, i) => (
          <span key={i} className="examera-hero-spark" style={vars({ left: `${s.x}%`, top: `${s.y}%`, '--d': `${s.d}s` })} />
        ))}
      </div>

      <Logo onDark style={{ padding: 0, position: 'relative', zIndex: 2 }} />

      <div className="examera-hero-text">
        <h2>
          {t('landing.heroTitle1')} {t('landing.heroTitle2')}
        </h2>
        <div className="stack" style={{ gap: 12, marginTop: 26 }}>
          {['landing.f1', 'landing.f2', 'landing.f3'].map((k, i) => (
            <div key={k} className="row examera-hero-feature" style={vars({ '--d': `${0.25 + i * 0.12}s` })}>
              <CheckCircle2 size={20} /> {t(`${k}Title`)}
            </div>
          ))}
        </div>
      </div>

      <div className="examera-hero-deco" aria-hidden="true">
        {/* Question card */}
        <div className="examera-hero-item examera-hero-at-question" style={vars({ '--d': '0.15s' })}>
          <div className="examera-hero-float" style={vars({ '--dur': '6s', '--amp': '-14px', '--fd': '0s' })}>
            <div className="examera-hero-card examera-hero-sheen">
              <div className="examera-hero-card-head">
                <span>{t('take.questionOf', { n: 3, total: 10 })}</span>
                <span className="examera-hero-timer">12:40</span>
              </div>
              <div className="examera-hero-q">2x + 6 = 14</div>
              {['x = 2', 'x = 4', 'x = 6', 'x = 8'].map((o, i) => (
                <div key={o} className={`examera-hero-opt${i === 1 ? ' examera-hero-on' : ''}`}>
                  <b>{'ABCD'[i]}</b> {o}
                  {i === 1 && <CheckCircle2 size={15} className="examera-hero-ok" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Result ring */}
        <div className="examera-hero-item examera-hero-at-ring" style={vars({ '--d': '0.35s' })}>
          <div className="examera-hero-float" style={vars({ '--dur': '5s', '--amp': '-10px', '--fd': '-1.5s' })}>
            <div className="examera-hero-card examera-hero-donut">
              <svg viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="32" className="examera-hero-track" />
                <circle cx="40" cy="40" r="32" className="examera-hero-value" />
              </svg>
              <div className="examera-hero-donut-val">
                <b>85%</b>
                <span>{t('common.result')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="examera-hero-item examera-hero-at-bars" style={vars({ '--d': '0.55s' })}>
          <div className="examera-hero-float" style={vars({ '--dur': '7s', '--amp': '-12px', '--fd': '-3s' })}>
            <div className="examera-hero-card examera-hero-sheen">
              <div className="examera-hero-card-head">
                <span className="row gap-sm">
                  <BarChart3 size={14} /> {t('authHero.analytics')}
                </span>
              </div>
              <div className="examera-hero-chart">
                {[46, 72, 58, 88, 66].map((h, i) => (
                  <span key={i} style={vars({ '--h': `${h}%`, '--i': i })} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Graduation cap */}
        <div className="examera-hero-item examera-hero-at-cap" style={vars({ '--d': '0.7s' })}>
          <div className="examera-hero-float" style={vars({ '--dur': '4.5s', '--amp': '-9px', '--fd': '-0.8s' })}>
            <div className="examera-hero-badge">
              <GraduationCap size={30} />
            </div>
          </div>
        </div>

        {/* Auto-check chip */}
        <div className="examera-hero-item examera-hero-at-chip" style={vars({ '--d': '0.85s' })}>
          <div className="examera-hero-float" style={vars({ '--dur': '5.5s', '--amp': '-8px', '--fd': '-2.2s' })}>
            <div className="examera-hero-chip">
              <ShieldCheck size={16} /> {t('landing.chipChecked')}
            </div>
          </div>
        </div>
      </div>

      <div className="small examera-hero-copy">© {new Date().getFullYear()} ExamEra</div>
    </div>
  );
}
