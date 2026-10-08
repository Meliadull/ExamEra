import { AlertCircle, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { useI18n, type TFn } from '../i18n';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant,
  size,
  block,
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'danger' | 'ghost' | 'danger-ghost';
  size?: 'sm' | 'lg';
  block?: boolean;
  loading?: boolean;
}) {
  return (
    <button type="button" className={cx('btn', variant, size, block && 'block', className)} disabled={rest.disabled || loading} {...rest}>
      {loading ? <span className="spinner" style={{ width: 16, height: 16, margin: 0, borderWidth: 2 }} /> : null}
      {children}
    </button>
  );
}

export function Card({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cx('card', flush && 'flush', className)}>
      {(title || action) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

export function Stat({ icon, tone = 'blue', value, label, delta, invertDelta }: { icon: ReactNode; tone?: Tone; value: ReactNode; label: ReactNode; delta?: number | null; invertDelta?: boolean }) {
  const up = (delta ?? 0) >= 0;
  const good = invertDelta ? !up : up;
  return (
    <div className="card stat">
      <div className={`stat-icon tone-${tone}`}>{icon}</div>
      <div>
        <div className="stat-value">
          {value}
          {delta != null && delta !== 0 && (
            <span className={cx('delta', good ? 'up' : 'down')}>
              {up ? '+' : ''}
              {Math.round(delta * 10) / 10}
            </span>
          )}
        </div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function PageHead({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-head">
      <div>
        {back && (
          <Link to={back.to} className="back">
            <ChevronLeft size={16} /> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('field', className)}>
      {label && <label>{label}</label>}
      {children}
      {error ? <div className="err">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx('input', className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cx('textarea', className)} {...p} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cx('select', className)} {...p}>
    {children}
  </select>
);

export function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ToggleRow({ title, hint, checked, onChange, disabled }: { title: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="bold">{title}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="loading" />;
}

export function Empty({ title, text, icon, action }: { title: ReactNode; text?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox />}
      <h3>{title}</h3>
      {text && <p style={{ margin: '4px 0 0' }}>{text}</p>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

export function errorText(t: TFn, e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' && Array.isArray(e.details) && e.details.length) {
      const d = e.details[0];
      const msg = t(`errors.${d.message}`);
      return msg.startsWith('errors.') ? `${t('errors.validation_error')}: ${d.path}` : msg;
    }
    const key = `errors.${e.code}`;
    const msg = t(key, e.details && typeof e.details === 'object' ? e.details : undefined);
    return msg === key ? t('errors.generic', { code: e.code }) : msg;
  }
  return t('errors.network_error');
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div className="alert error">
      <AlertCircle />
      <span>{errorText(t, error)}</span>
    </div>
  );
}

/** Loading / error wrapper for useApi results. */
export function Loader<T>({ state, children }: { state: { data?: T; error: unknown; loading: boolean }; children: (data: T) => ReactNode }) {
  if (state.error && !state.data) return <ErrorBox error={state.error} />;
  if (state.data === undefined) return <Spinner />;
  return <>{children(state.data)}</>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ title, text, confirmLabel, danger, onConfirm, onClose }: { title: ReactNode; text: ReactNode; confirmLabel?: ReactNode; danger?: boolean; onConfirm: () => Promise<unknown> | void; onClose: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setErr(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{text}</p>
      {!!err && (
        <div className="mt">
          <ErrorBox error={err} />
        </div>
      )}
    </Modal>
  );
}

export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="small muted">{t('common.shownOf', { from: total ? (page - 1) * pageSize + 1 : 0, to: Math.min(total, page * pageSize), total })}</span>
      <div className="row gap-sm">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft />
        </Button>
        <span className="small">
          {page} / {pages}
        </span>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {url ? <img src={url} alt="" referrerPolicy="no-referrer" /> : initials}
    </span>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function pctTone(p?: number | null): Tone {
  if (p == null) return 'gray';
  if (p >= 90) return 'green';
  if (p >= 70) return 'blue';
  if (p >= 50) return 'orange';
  return 'red';
}

export function PctBadge({ value }: { value?: number | null }) {
  return <Badge tone={pctTone(value)}>{value == null ? '—' : `${Math.round(value * 10) / 10}%`}</Badge>;
}

/* ---------- Toasts ---------- */

interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}
const ToastCtx = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastItem['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.kind}`}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Hook for submit handlers: tracks busy state and surfaces errors via toast. */
export function useAction() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast(success, 'success');
        return r;
      } catch (e) {
        toast(errorText(t, e), 'error');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast, t],
  );
  return { busy, run };
}
