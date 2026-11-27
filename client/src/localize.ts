import { useCallback, useSyncExternalStore } from 'react';
import { api } from './api';
import { useI18n } from './i18n';

/*
 * Content translations. Tests, questions and options keep their original text in the main field and an
 * optional Russian translation in `<field>_ru` (the bundled sample bank is written in Uzbek with Russian
 * translations; a teacher's own test usually has only the original).
 */

/** Picks `<field>_ru` in the Russian interface when it exists, otherwise the original `<field>`. */
export function useLoc() {
  const { lang } = useI18n();
  return useCallback(
    (o: Record<string, any> | null | undefined, field = 'text'): string => {
      if (!o) return '';
      const ru = o[`${field}_ru`];
      return lang === 'ru' && typeof ru === 'string' && ru ? ru : (o[field] ?? '');
    },
    [lang],
  );
}

/* Subject names in both languages, loaded once and shared by every component. */
type Names = Record<string, { uz?: string | null; ru?: string | null }>;
let names: Names | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load() {
  if (names || loading) return;
  loading = true;
  api<{ name: string; name_uz: string | null; name_ru: string | null }[]>('/subjects/names')
    .then((rows) => {
      names = Object.fromEntries(rows.map((r) => [r.name, { uz: r.name_uz, ru: r.name_ru }]));
      listeners.forEach((l) => l());
    })
    .catch(() => {
      loading = false; // e.g. not signed in yet: try again on the next mount
    });
}

/** Localized subject name for a stored subject name (falls back to the name itself). */
export function useSubjectName() {
  const { lang } = useI18n();
  const map = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      load();
      return () => listeners.delete(cb);
    },
    () => names,
  );
  return useCallback((name: string | null | undefined) => (name ? map?.[name]?.[lang] || name : ''), [map, lang]);
}

/** Forget cached names (after an administrator renames or adds a subject). */
export function refreshSubjectNames() {
  names = null;
  loading = false;
  load();
}
