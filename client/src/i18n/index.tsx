import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ru } from './ru';
import { uz } from './uz';

export type Lang = 'ru' | 'uz';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: "O'zbekcha" },
];

/** Adding a language = adding a dictionary file here; business logic stays untouched. */
const DICTS: Record<Lang, Record<string, string>> = { ru, uz };
const LOCALES: Record<Lang, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

export type TFn = (key: string, params?: Record<string, string | number | null | undefined>) => string;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
  locale: string;
}

const Ctx = createContext<I18n>(null!);

function initialLang(): Lang {
  try {
    const s = localStorage.getItem('ee_lang');
    if (s === 'ru' || s === 'uz') return s;
  } catch {
    /* storage unavailable */
  }
  return 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem('ee_lang', l);
    } catch {
      /* ignore */
    }
  }, []);
  const t = useCallback<TFn>(
    (key, params) => {
      let s = DICTS[lang][key] ?? ru[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v ?? ''));
      return s;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t, locale: LOCALES[lang] }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(() => {
    const date = (iso?: string | null) =>
      iso ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const dateTime = (iso?: string | null) =>
      iso
        ? new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';
    const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '—');
    const shortDate = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const duration = (sec?: number | null) => {
      if (sec == null) return '—';
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    };
    const minutes = (sec?: number | null) => (sec == null ? '—' : t('common.minShort', { n: Math.round(sec / 60) }));
    const pct = (v?: number | null) => (v == null ? '—' : `${Math.round(v * 10) / 10}%`);
    const relative = (iso: string) => {
      const diff = Date.parse(iso) - Date.now();
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      const abs = Math.abs(diff);
      if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
      if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), 'hour');
      return rtf.format(Math.round(diff / 86400_000), 'day');
    };
    const num = (v?: number | null) => (v == null ? '—' : v.toLocaleString(locale));
    return { date, dateTime, time, shortDate, duration, minutes, pct, relative, num };
  }, [locale, t]);
}
