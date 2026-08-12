// 관리자모드: 간트차트. tasks의 start_date/end_date를 드래그로 바로 조절한다.
// wbsAdmin.js와 마찬가지로 tasks 업데이트는 data.js의 updateTask()만 사용 -
// 일정등록/모니터링 코드는 이 파일을 참조하지 않는다.
import { fetchCategories, fetchWbsItems, updateTask } from "./data.js";
import { PARTS, escapeHtml, showToast, toISO, parseISO, daysBetween, today, addDays, STATUS } from "./util.js";

const CATEGORY_COLORS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];
const STATUS_ORDER = ["ready", "doing", "done"];
const DAY_WIDTH = 28;
const CLICK_THRESHOLD_PX = 4;

let categories = [];
let wbsItems = [];
let rangeStart = null;
let rangeDays = 0;
let drag = null;

const els = {};

export function init(){
  els.colgroup = document.getElementById("ganttColgroup");
  els.headerRow = document.getElementById("ganttHeaderRow");
  els.body = document.getElementById("ganttBody");

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

export async function refresh(){
  els.body.innerHTML = '<tr><td class="empty">불러오는 중...</td></tr>';
  try {
    [categories, wbsItems] = await Promise.all([fetchCategories(), fetchWbsItems()]);
  } catch (err){
    els.body.innerHTML = '<tr><td class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</td></tr>";
    return;
  }
  render();
}

function computeRange(){
  if (wbsItems.length === 0){
    rangeStart = today();
    rangeDays = 14;
    return;
  }
  let min = parseISO(wbsItems[0].task.start_date);
  let max = parseISO(wbsItems[0].task.end_date);
  wbsItems.forEach((w) => {
    const s = parseISO(w.task.start_date);
    const e = parseISO(w.task.end_date);
    if (s < min) min = s;
    if (e > max) max = e;
  });
  rangeStart = addDays(min, -2);
  rangeDays = daysBetween(rangeStart, addDays(max, 3));
}

function dayOffset(dateISO){
  return daysBetween(rangeStart, parseISO(dateISO));
}

function render(){
  if (wbsItems.length === 0){
    els.colgroup.innerHTML = "";
    els.headerRow.innerHTML = "";
    els.body.innerHTML = '<tr><td class="empty">WBS 항목이 없습니다. WBS 디테일에서 먼저 항목을 추가해주세요.</td></tr>';
    return;
  }
  computeRange();
  const catIndexMap = new Map(categories.map((c, i) => [c.id, i]));
  const todayIso = toISO(today());

  els.colgroup.innerHTML =
    '<col class="gantt-col-wbs" /><col class="gantt-col-cat" /><col class="gantt-col-part" /><col class="gantt-col-title" /><col class="gantt-col-owner" />' +
    Array.from({ length: rangeDays }).map(() => '<col style="width:' + DAY_WIDTH + 'px" />').join("");

  const headerCells = [];
  for (let i = 0; i < rangeDays; i++){
    const d = addDays(rangeStart, i);
    const iso = toISO(d);
    headerCells.push(
      '<th class="gantt-day-header' + (iso === todayIso ? " today" : "") + '">' + (d.getMonth() + 1) + "/" + d.getDate() + "</th>"
    );
  }
  els.headerRow.innerHTML =
    '<th class="gantt-col-header gantt-col-wbs">WBS</th>' +
    '<th class="gantt-col-header gantt-col-cat">대분류</th>' +
    '<th class="gantt-col-header gantt-col-part">소분류</th>' +
    '<th class="gantt-col-header gantt-col-title">작업명</th>' +
    '<th class="gantt-col-header gantt-col-owner">담당자</th>' +
    headerCells.join("");

  const sorted = [...wbsItems].sort((a, b) => {
    const ai = a.category_id && catIndexMap.has(a.category_id) ? catIndexMap.get(a.category_id) : 999;
    const bi = b.category_id && catIndexMap.has(b.category_id) ? catIndexMap.get(b.category_id) : 999;
    if (ai !== bi) return ai - bi;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  els.body.innerHTML = sorted.map((w) => {
    const t = w.task;
    const part = PARTS[t.part];
    const cat = w.category_id ? categories.find((c) => c.id === w.category_id) : null;
    const catColor = w.category_id && catIndexMap.has(w.category_id) ? CATEGORY_COLORS[catIndexMap.get(w.category_id) % 8] : "var(--border)";
    const left = dayOffset(t.start_date) * DAY_WIDTH;
    const width = (daysBetween(parseISO(t.start_date), parseISO(t.end_date)) + 1) * DAY_WIDTH;
    const st = STATUS[t.status];
    return (
      '<tr data-id="' + t.id + '" style="--cat-color:' + catColor + '">' +
        '<td class="gantt-cell gantt-col-wbs">' + escapeHtml(w.wbs_code || "-") + "</td>" +
        '<td class="gantt-cell gantt-col-cat">' + (cat ? escapeHtml(cat.name) : "-") + "</td>" +
        '<td class="gantt-cell gantt-col-part"><span class="dot" style="background:' + part.color + '"></span>' + part.label + "</td>" +
        '<td class="gantt-cell gantt-col-title" title="' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + "</td>" +
        '<td class="gantt-cell gantt-col-owner">' + escapeHtml(t.owner) + "</td>" +
        '<td class="gantt-timeline-cell" colspan="' + rangeDays + '">' +
          '<div class="gantt-bar-track" style="width:' + (rangeDays * DAY_WIDTH) + 'px">' +
            '<div class="gantt-bar" data-id="' + t.id + '" style="left:' + left + "px;width:" + width + 'px;background:' + st.color + '">' +
              '<span class="gantt-bar-handle left" data-mode="resize-left"></span>' +
              '<span class="gantt-bar-handle right" data-mode="resize-right"></span>' +
            "</div>" +
          "</div>" +
        "</td>" +
      "</tr>"
    );
  }).join("");

  els.body.querySelectorAll(".gantt-bar").forEach((bar) => {
    bar.addEventListener("pointerdown", (e) => startDrag(e, bar, "move"));
  });
  els.body.querySelectorAll(".gantt-bar-handle").forEach((handle) => {
    handle.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startDrag(e, handle.closest(".gantt-bar"), handle.dataset.mode);
    });
  });
}

function startDrag(e, barEl, mode){
  const id = barEl.dataset.id;
  const w = wbsItems.find((x) => x.task.id === id);
  if (!w) return;
  drag = {
    id,
    mode,
    startX: e.clientX,
    origStart: parseISO(w.task.start_date),
    origEnd: parseISO(w.task.end_date),
    origStatus: w.task.status,
    moved: false,
    barEl
  };
  barEl.setPointerCapture(e.pointerId);
  barEl.classList.add("dragging");
}

function onPointerMove(e){
  if (!drag) return;
  if (Math.abs(e.clientX - drag.startX) > CLICK_THRESHOLD_PX) drag.moved = true;
  const deltaDays = Math.round((e.clientX - drag.startX) / DAY_WIDTH);
  let newStart = drag.origStart;
  let newEnd = drag.origEnd;

  if (drag.mode === "move"){
    newStart = addDays(drag.origStart, deltaDays);
    newEnd = addDays(drag.origEnd, deltaDays);
  } else if (drag.mode === "resize-left"){
    newStart = addDays(drag.origStart, deltaDays);
    if (newStart > drag.origEnd) newStart = drag.origEnd;
  } else if (drag.mode === "resize-right"){
    newEnd = addDays(drag.origEnd, deltaDays);
    if (newEnd < drag.origStart) newEnd = drag.origStart;
  }

  drag.newStart = newStart;
  drag.newEnd = newEnd;
  drag.barEl.style.left = (dayOffset(toISO(newStart)) * DAY_WIDTH) + "px";
  drag.barEl.style.width = ((daysBetween(newStart, newEnd) + 1) * DAY_WIDTH) + "px";
}

async function onPointerUp(){
  if (!drag) return;
  const current = drag;
  drag = null;
  current.barEl.classList.remove("dragging");

  // 드래그 없이 그냥 클릭한 경우 - 막대 몸통 클릭이면 상태를 한 단계 돌린다.
  if (!current.moved){
    if (current.mode === "move"){
      const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(current.origStatus) + 1) % STATUS_ORDER.length];
      try {
        await updateTask(current.id, { status: nextStatus });
        showToast("상태를 " + STATUS[nextStatus].label + "으로 변경했습니다");
        await refresh();
      } catch (err){
        showToast("변경 실패: " + err.message, true);
      }
    }
    return;
  }

  const newStartISO = toISO(current.newStart || current.origStart);
  const newEndISO = toISO(current.newEnd || current.origEnd);
  const oldStartISO = toISO(current.origStart);
  const oldEndISO = toISO(current.origEnd);
  if (newStartISO === oldStartISO && newEndISO === oldEndISO) return;

  try {
    await updateTask(current.id, { start_date: newStartISO, end_date: newEndISO });
    showToast("일정을 조정했습니다");
    await refresh();
  } catch (err){
    showToast("조정 실패: " + err.message, true);
    await refresh();
  }
}
