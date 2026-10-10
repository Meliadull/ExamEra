import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export interface PickerOption {
  value: number;
  label: string;
  hint?: ReactNode;
}

/**
 * Dropdown that looks like a regular <select> but supports multiple choice (shown as chips),
 * an optional search box and server-side search (`onSearch`). Keyboard: ↑/↓, Enter/Space, Esc.
 */
export function Picker({
  options,
  value,
  onChange,
  multiple = true,
  placeholder,
  disabled,
  onSearch,
  ariaLabel,
}: {
  options: PickerOption[];
  value: number[];
  onChange: (v: number[]) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  onSearch?: (q: string) => void;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  // Remember labels of options seen earlier (server search may no longer return a selected item).
  const known = useRef(new Map<number, PickerOption>());
  options.forEach((o) => known.current.set(o.value, o));

  const searchable = !!onSearch || options.length > 7;
  const shown = useMemo(
    () => (onSearch || !q ? options : options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))),
    [options, q, onSearch],
  );
  const selected = value.map((v) => known.current.get(v)).filter((o): o is PickerOption => !!o);

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 280 && r.top > below;
    setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, value.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (!triggerRef.current?.contains(tgt) && !popRef.current?.contains(tgt)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => (searchable ? searchRef.current : popRef.current)?.focus(), 0);
    } else {
      setQ('');
      onSearch?.('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (v: number) => {
    if (!multiple) {
      onChange([v]);
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  const onListKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' || (e.key === ' ' && e.target === popRef.current)) {
      e.preventDefault();
      if (shown[active]) toggle(shown[active].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // keep an enclosing modal open
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <>
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled}
        className={`input picker${disabled ? ' disabled' : ''}${open ? ' open' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (['ArrowDown', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {selected.length === 0 && <span className="picker-placeholder">{placeholder ?? t('picker.choose')}</span>}
        {!multiple && selected[0] && <span className="picker-single">{selected[0].label}</span>}
        {multiple &&
          selected.map((o) => (
            <span className="picker-chip" key={o.value}>
              {o.label}
              {!disabled && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`${t('common.remove')}: ${o.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(value.filter((x) => x !== o.value));
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        <ChevronDown className="picker-chevron" size={16} aria-hidden />
      </div>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="picker-pop"
            tabIndex={-1}
            onKeyDown={onListKey}
            style={{ left: pos.left, width: Math.max(pos.width, 240), ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          >
            {searchable && (
              <div className="picker-search">
                <Search size={15} aria-hidden />
                <input
                  ref={searchRef}
                  value={q}
                  placeholder={t('common.search')}
                  aria-label={t('common.search')}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                    onSearch?.(e.target.value);
                  }}
                />
              </div>
            )}
            <div className="picker-list" role="listbox" id={listId} aria-multiselectable={multiple}>
              {shown.length === 0 && <div className="picker-empty">{t('common.nothingFound')}</div>}
              {shown.map((o, i) => {
                const on = value.includes(o.value);
                return (
                  <div
                    key={o.value}
                    role="option"
                    aria-selected={on}
                    className={`picker-opt${i === active ? ' active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(o.value)}
                  >
                    <span className={`picker-tick${multiple ? '' : ' round'}`}>{on && <Check size={13} />}</span>
                    <span className="grow">
                      {o.label}
                      {o.hint && <span className="picker-hint">{o.hint}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            {multiple && value.length > 0 && (
              <div className="picker-foot">
                <span>{t('assign.selectedN', { n: value.length })}</span>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange([])}>
                  {t('picker.clear')}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
