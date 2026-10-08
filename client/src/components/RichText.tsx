import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderInline(text: string): string {
  // $$block$$ and $inline$ formulas (LaTeX); everything else is escaped text.
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g);
  return parts
    .map((p) => {
      if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
        return katex.renderToString(p.slice(2, -2), { throwOnError: false, displayMode: true });
      }
      if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
        return katex.renderToString(p.slice(1, -1), { throwOnError: false });
      }
      return esc(p);
    })
    .join('');
}

/**
 * Renders question text: LaTeX formulas between $...$ and simple pipe tables:
 *   | a | b |
 *   | 1 | 2 |
 */
export function toHtml(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let para: string[] = [];
  let table: string[][] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(renderInline).join('<br/>')}</p>`);
    para = [];
  };
  const flushTable = () => {
    if (table.length) {
      const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
      out.push(
        `<table>${rows
          .map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${renderInline(c.trim())}</th>` : `<td>${renderInline(c.trim())}</td>`)).join('')}</tr>`)
          .join('')}</table>`,
      );
    }
    table = [];
  };
  for (const line of lines) {
    const tline = line.trim();
    if (tline.startsWith('|') && tline.endsWith('|') && tline.length > 2) {
      flushPara();
      table.push(tline.slice(1, -1).split('|'));
    } else {
      flushTable();
      if (tline === '') flushPara();
      else para.push(line);
    }
  }
  flushTable();
  flushPara();
  return out.join('');
}

export function RichText({ text, className, inline }: { text: string; className?: string; inline?: boolean }) {
  const html = useMemo(() => (inline ? renderInline(text) : toHtml(text)), [text, inline]);
  return inline ? (
    <span className={`rich ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <div className={`rich ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
