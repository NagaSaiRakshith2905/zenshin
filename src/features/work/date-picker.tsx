"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Dates are plain "YYYY-MM-DD" strings; all math runs in UTC so no timezone can shift a day.
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number) => { const d = parse(value); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
export function addMonths(value: string, months: number) {
  const d = parse(value); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last)); return iso(d);
}
export function todayIso() { const now = new Date(); return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))); }
/** Six Sunday-first weeks covering the month of `value`. */
export function monthGrid(value: string) {
  const first = parse(value); first.setUTCDate(1);
  const start = addDays(iso(first), -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function formatDate(value: string) { return parse(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
const monthLabel = (value: string) => parse(value).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 2));

export function DatePicker({ value, label, pick }: { value: string | null; label: string; pick: (value: string | null) => void }) {
  const today = todayIso();
  const [focused, setFocused] = useState(value ?? today);
  const grid = useRef<HTMLDivElement>(null);
  const month = focused.slice(0, 7);
  // Focus follows the day only on open or while the grid has focus, so month buttons keep theirs.
  const initial = useRef(true);
  useEffect(() => {
    if (!initial.current && !grid.current?.contains(document.activeElement)) return;
    initial.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus({ preventScroll: true });
  }, [focused]);
  const move: Record<string, (d: string) => string> = { ArrowLeft: (d) => addDays(d, -1), ArrowRight: (d) => addDays(d, 1), ArrowUp: (d) => addDays(d, -7), ArrowDown: (d) => addDays(d, 7), PageUp: (d) => addMonths(d, -1), PageDown: (d) => addMonths(d, 1) };
  return <div className="date-picker">
    <div className="date-picker-header">
      <span className="date-picker-month" aria-live="polite">{monthLabel(focused)}</span>
      <button type="button" className="date-picker-today" onClick={() => setFocused(today)}>Today</button>
      <button type="button" className="date-picker-nav" aria-label="Previous month" onClick={() => setFocused(addMonths(focused, -1))}><ChevronLeft size={16} /></button>
      <button type="button" className="date-picker-nav" aria-label="Next month" onClick={() => setFocused(addMonths(focused, 1))}><ChevronRight size={16} /></button>
    </div>
    <div ref={grid} role="grid" aria-label={label} className="date-picker-grid" onKeyDown={(e) => { const next = move[e.key]; if (!next) return; e.preventDefault(); setFocused(next(focused)); }}>
      {weekdays.map((d) => <span key={d} role="columnheader" className="date-picker-weekday">{d}</span>)}
      {monthGrid(focused).map((day) => <button key={day} type="button" role="gridcell" data-day={day} tabIndex={day === focused ? 0 : -1} aria-selected={day === value} aria-current={day === today ? "date" : undefined} aria-label={formatDate(day)} className="date-picker-day" data-outside={day.slice(0, 7) !== month || undefined} onClick={() => pick(day)}>{Number(day.slice(8))}</button>)}
    </div>
    {value && <div className="date-picker-footer"><button type="button" onClick={() => pick(null)}>Clear</button></div>}
  </div>;
}
