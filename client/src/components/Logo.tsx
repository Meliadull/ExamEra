import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n';

/**
 * Brand logo: 3D mark + "Exam" (dark) "Era" (blue) wordmark. Always leads to the home page;
 * when already there, it scrolls back to the top. `onDark` is for blue/dark backgrounds.
 */
export function Logo({ onDark, size = 34, style }: { onDark?: boolean; size?: number; style?: CSSProperties }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  return (
    <Link
      to="/"
      className={`brand${onDark ? ' on-dark' : ''}`}
      style={style}
      aria-label={`ExamEra — ${t('logo.home')}`}
      title={t('logo.home')}
      onClick={(e) => {
        if (pathname !== '/') return;
        e.preventDefault();
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const start = window.scrollY;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        // Smooth scrolling needs rendered frames; if it never started, jump instead.
        setTimeout(() => {
          if (window.scrollY === start && start > 0) window.scrollTo({ top: 0 });
        }, 700);
      }}
    >
      <img src="/logo-mark.svg" alt="" style={{ height: size }} />
      <span className="wordmark">
        Exam<b>Era</b>
      </span>
    </Link>
  );
}
