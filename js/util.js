// 여러 화면(js/schedule.js, js/monitor.js, js/report.js)이 공유하는 상수/유틸.
export const PARTS = {
  plc:   { label: "PLC",        color: "var(--series-plc)" },
  elec:  { label: "전장",       color: "var(--series-elec)" },
  mech:  { label: "기구",       color: "var(--series-mech)" },
  scada: { label: "SCADA",      color: "var(--series-scada)" },
  dtwin: { label: "디지털트윈", color: "var(--series-dtwin)" }
};
export const PART_ORDER = ["plc", "elec", "mech", "scada", "dtwin"];

export const STATUS = {
  ready: { label: "준비중",   color: "var(--text-muted)" },
  doing: { label: "작업중",   color: "var(--status-warning)" },
  done:  { label: "작업완료", color: "var(--status-good)" }
};

export const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function pad(n){ return n < 10 ? "0" + n : "" + n; }
export function toISO(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function addDays(base, n){ const d = new Date(base); d.setDate(d.getDate() + n); return d; }
export function today(){ const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
export function parseISO(s){ const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
export function daysBetween(a, b){ return Math.round((b - a) / 86400000); }
export function daysInMonth(year, month1based){ return new Date(year, month1based, 0).getDate(); }

export const PROGRESS_STEPS = [0, 25, 50, 75, 100];

// 시작일~종료일을 포함해서 며칠짜리 작업인지 (8/11~8/12 => 2일)
export function taskDuration(startISO, endISO){
  if (!startISO || !endISO) return null;
  return daysBetween(parseISO(startISO), parseISO(endISO)) + 1;
}

// 시작일/종료일/기간을 어디서든 같은 모양으로 보여주기 위한 공용 렌더러.
export function dateRangeHTML(startISO, endISO){
  const dur = taskDuration(startISO, endISO);
  return (
    '<div class="date-range">' +
      '<span class="date-range-seg"><b>시작</b>' + startISO + "</span>" +
      '<span class="date-range-seg"><b>종료</b>' + endISO + "</span>" +
      (dur !== null ? '<span class="date-range-seg date-range-duration">' + dur + "일</span>" : "") +
    "</div>"
  );
}

// 진행률(0/25/50/75/100)을 어디서든 같은 모양으로 보여주기 위한 공용 렌더러.
export function progressBarHTML(progress){
  const pct = Number(progress) || 0;
  return (
    '<div class="progress-mini">' +
      '<div class="progress-mini-track"><div class="progress-mini-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="progress-mini-label">' + pct + "%</span>" +
    "</div>"
  );
}

export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function ddayInfo(task){
  if (task.status === "done" || !task.end_date) return null;
  const diff = daysBetween(today(), parseISO(task.end_date));
  const label = diff >= 0 ? "D-" + diff : "D+" + (-diff);
  const tone = diff < 0 ? "critical" : diff === 0 ? "warning" : "muted";
  return { label, tone };
}

function csvEscape(value){
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function downloadCSV(filename, rows){
  const csv = "﻿" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let toastTimer = null;
export function showToast(message, isError){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", !!isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}
