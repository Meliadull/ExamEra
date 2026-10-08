import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface Column {
  key: string;
  ru: string;
  uz: string;
  width?: number;
}

export type Lang = 'ru' | 'uz';

export const COLS = {
  test: { key: 'test', ru: 'Тест', uz: 'Test', width: 32 },
  subject: { key: 'subject', ru: 'Предмет', uz: 'Fan', width: 18 },
  group: { key: 'group', ru: 'Группа', uz: 'Guruh', width: 16 },
  student: { key: 'student', ru: 'Учащийся', uz: "O'quvchi", width: 26 },
  score: { key: 'score', ru: 'Баллы', uz: 'Ball', width: 9 },
  maxScore: { key: 'maxScore', ru: 'Макс. балл', uz: 'Maks. ball', width: 11 },
  percentage: { key: 'percentage', ru: 'Процент', uz: 'Foiz', width: 10 },
  correct: { key: 'correct', ru: 'Правильно', uz: "To'g'ri", width: 11 },
  wrong: { key: 'wrong', ru: 'Неправильно', uz: "Noto'g'ri", width: 12 },
  skipped: { key: 'skipped', ru: 'Пропущено', uz: "O'tkazib yuborilgan", width: 12 },
  passed: { key: 'passed', ru: 'Статус', uz: 'Holat', width: 12 },
  date: { key: 'date', ru: 'Дата прохождения', uz: 'Topshirilgan sana', width: 19 },
  duration: { key: 'duration', ru: 'Время прохождения', uz: 'Sarflangan vaqt', width: 15 },
} satisfies Record<string, Column>;

export const passedLabel = (passed: number | null, lang: Lang) =>
  passed ? (lang === 'uz' ? "O'tdi" : 'Сдал') : lang === 'uz' ? "O'tmadi" : 'Не сдал';

export function fmtDuration(sec: number | null) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function csvCell(v: unknown) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function sendTable(
  res: Response,
  opts: { format: string; filename: string; lang: Lang; title?: string[]; columns: Column[]; rows: Record<string, unknown>[] },
) {
  const { columns, rows, lang } = opts;
  const safeName = opts.filename.replace(/[^\w.-]+/g, '_');
  if (opts.format === 'csv') {
    const lines = [columns.map((c) => csvCell(c[lang])).join(';'), ...rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(';'))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
    return;
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ExamEra';
  const ws = wb.addWorksheet('Report');
  let rowIdx = 1;
  for (const line of opts.title ?? []) {
    ws.getCell(rowIdx, 1).value = line;
    ws.getCell(rowIdx, 1).font = { bold: rowIdx === 1, size: rowIdx === 1 ? 14 : 11 };
    rowIdx++;
  }
  if (opts.title?.length) rowIdx++;
  const header = ws.getRow(rowIdx);
  columns.forEach((c, i) => {
    header.getCell(i + 1).value = c[lang];
    ws.getColumn(i + 1).width = c.width ?? 14;
  });
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  for (const r of rows) ws.addRow(columns.map((c) => r[c.key] ?? ''));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}
