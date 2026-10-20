import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useI18n } from './i18n';

export type Theme = 'light' | 'dark';

const KEY = 'ee_theme';
const listeners = new Set<() => void>();
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1120' : '#2563eb');
  listeners.forEach((l) => l());
}

/** Switches the theme, remembers the choice and animates from `origin` (a circular reveal where supported). */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable: the switch still works for this page view */
  }
  if (theme === getTheme()) return;
  if (reducedMotion.matches) return apply(theme);

  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; skipTransition?: () => void } };
  if (doc.startViewTransition && origin) {
    const { x, y } = origin;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    let applied = false;
    const run = () => {
      if (!applied) {
        applied = true;
        apply(theme);
      }
    };
    const vt = doc.startViewTransition(run);
    vt.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 550, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
    // The transition waits for the next rendered frame; never let the switch itself depend on it.
    setTimeout(run, 300);
    // A transition that never finishes would keep swallowing clicks: end it after the animation.
    setTimeout(() => vt.skipTransition?.(), 900);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-anim');
  apply(theme);
  setTimeout(() => root.classList.remove('theme-anim'), 400);
}

// Follow the OS setting until the user makes an explicit choice; keep open tabs in sync.
systemDark.addEventListener('change', (e) => {
  if (!storedTheme()) apply(e.matches ? 'dark' : 'light');
});
window.addEventListener('storage', (e) => {
  if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) apply(e.newValue);
});

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getTheme,
  );
}

export function ThemeToggle() {
  const theme = useTheme();
  const { t } = useI18n();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t('theme.dark')}
      title={dark ? t('theme.toLight') : t('theme.toDark')}
      className="theme-toggle"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        // A mouse/touch click picks the half that was pressed (sun = light, moon = dark);
        // the keyboard (detail === 0) simply switches.
        const next: Theme = e.detail > 0 ? (e.clientX < r.left + r.width / 2 ? 'light' : 'dark') : dark ? 'light' : 'dark';
        if (next === theme) return;
        setTheme(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
    >
      <Sun className="track-icon sun" aria-hidden />
      <Moon className="track-icon moon" aria-hidden />
      <span className="knob" aria-hidden>
        {dark ? <Moon /> : <Sun />}
      </span>
    </button>
  );
}
