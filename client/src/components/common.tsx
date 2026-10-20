import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApi } from '../api';
import { useI18n, type TFn } from '../i18n';
import type { Group, QuestionType, Subject, TestStatus } from '../types';
import { RichText } from './RichText';
import { Badge, Select, type Tone } from './ui';

const STATUS_TONE: Record<TestStatus, Tone> = { draft: 'orange', published: 'blue', completed: 'green', archived: 'gray' };

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status]}>{t(`testStatus.${status}`)}</Badge>;
}

const BOOL_TOKENS = new Set(['yes', 'no', 'true', 'false']);

/** yes/no and true/false options are stored as tokens and localized on display. */
export function optionText(t: TFn, type: QuestionType, text: string) {
  return (type === 'yes_no' || type === 'true_false') && BOOL_TOKENS.has(text) ? t(`q.opt.${text}`) : text;
}

export function OptionText({ type, text }: { type: QuestionType; text: string }) {
  const { t } = useI18n();
  const s = optionText(t, type, text);
  return s === text ? <RichText text={text} inline /> : <span>{s}</span>;
}

/** All subjects, or (mine) only those an administrator assigned to the current teacher. */
export function useSubjects(mine = false) {
  return useApi<Subject[]>('/subjects', mine ? { mine: 1 } : undefined);
}

export function useGroups() {
  return useApi<Group[]>('/groups');
}

export function SubjectSelect({ value, onChange, allLabel }: { value: string; onChange: (v: string) => void; allLabel?: string }) {
  const { t } = useI18n();
  const { data } = useSubjects();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel ?? t('filters.allSubjects')}</option>
      {data?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

export function GroupSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const { data } = useGroups();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('filters.allGroups')}</option>
      {data?.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}

export type Period = '7' | '30' | '180' | '365' | 'all';

export function periodFrom(p: Period): string | undefined {
  if (p === 'all') return undefined;
  const d = new Date(Date.now() - Number(p) * 86400_000);
  return d.toISOString().slice(0, 10);
}

export function usePeriod(initial: Period = '30') {
  const [period, setPeriod] = useState<Period>(initial);
  const from = useMemo(() => periodFrom(period), [period]);
  return { period, setPeriod, from };
}

export function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useI18n();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Period)}>
      <option value="7">{t('period.7')}</option>
      <option value="30">{t('period.30')}</option>
      <option value="180">{t('period.180')}</option>
      <option value="365">{t('period.365')}</option>
      <option value="all">{t('period.all')}</option>
    </Select>
  );
}

export function auditActionLabel(t: TFn, action: string) {
  const key = `audit.action.${action}`;
  const s = t(key);
  return s === key ? action : s;
}

/** Case-insensitive "contains" over several fields (client-side filtering of short lists). */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]) {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => f?.toLowerCase().includes(q));
}

/** Distinct, sorted non-empty values of a list — options for a client-side filter. */
export function distinct(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

/** A select over plain string options with an "all" entry. */
export function ValueSelect({ value, onChange, options, allLabel, label }: { value: string; onChange: (v: string) => void; options: string[]; allLabel: string; label?: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label ?? allLabel}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}

/** "Clear filters" link-button, shown only while some filter is set. */
export function ResetFilters({ active, onReset }: { active: boolean; onReset: () => void }) {
  const { t } = useI18n();
  if (!active) return null;
  return (
    <button type="button" className="btn ghost sm" onClick={onReset}>
      <X /> {t('filters.reset')}
    </button>
  );
}

/** Teacher filter for administrators and auditors (teachers only ever see their own items). */
export function TeacherSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const { data } = useApi<{ items: { id: number; first_name: string; last_name: string }[] }>('/users', { role: 'teacher', pageSize: 200, sort: 'name' });
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('filters.allTeachers')}>
      <option value="">{t('filters.allTeachers')}</option>
      {data?.items.map((u) => (
        <option key={u.id} value={u.id}>
          {u.last_name} {u.first_name}
        </option>
      ))}
    </Select>
  );
}
