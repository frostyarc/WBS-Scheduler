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
let syncingScroll = false;

const els = {};

export function init(){
  els.frozen = document.getElementById("ganttFrozen");
  els.frozenHeader = document.getElementById("ganttFrozenHeader");
  els.frozenBody = document.getElementById("ganttFrozenBody");
  els.scroll = document.getElementById("ganttScroll");
  els.scrollInner = document.getElementById("ganttScrollInner");
  els.scrollHeader = document.getElementById("ganttScrollHeader");
  els.scrollBody = document.getElementById("ganttScrollBody");

  // 라벨(왼쪽)과 타임라인(오른쪽)이 완전히 분리된 두 스크롤 컨테이너라서, 세로 스크롤만
  // 서로 맞춰준다 (가로 스크롤은 오른쪽에만 있어서 동기화할 필요가 없다).
  els.frozen.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    els.scroll.scrollTop = els.frozen.scrollTop;
    syncingScroll = false;
  });
  els.scroll.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    els.frozen.scrollTop = els.scroll.scrollTop;
    syncingScroll = false;
  });

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
}

export async function refresh(){
  els.frozenBody.innerHTML = "";
  els.scrollBody.innerHTML = '<div class="empty">불러오는 중...</div>';
  try {
    [categories, wbsItems] = await Promise.all([fetchCategories(), fetchWbsItems()]);
  } catch (err){
    els.scrollBody.innerHTML = '<div class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</div>";
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
    els.frozenHeader.innerHTML = "";
    els.frozenBody.innerHTML = "";
    els.scrollHeader.innerHTML = "";
    els.scrollBody.innerHTML = '<div class="empty">WBS 항목이 없습니다. WBS 디테일에서 먼저 항목을 추가해주세요.</div>';
    return;
  }
  computeRange();
  const catIndexMap = new Map(categories.map((c, i) => [c.id, i]));
  const todayIso = toISO(today());
  const timelineWidth = rangeDays * DAY_WIDTH;

  els.frozenHeader.innerHTML =
    '<div class="gantt-hcol gantt-hcol-wbs">WBS</div>' +
    '<div class="gantt-hcol gantt-hcol-cat">대분류</div>' +
    '<div class="gantt-hcol gantt-hcol-part">소분류</div>' +
    '<div class="gantt-hcol gantt-hcol-title">작업명</div>' +
    '<div class="gantt-hcol gantt-hcol-owner">담당자</div>';

  els.scrollInner.style.width = timelineWidth + "px";
  const headerCells = [];
  for (let i = 0; i < rangeDays; i++){
    const d = addDays(rangeStart, i);
    const iso = toISO(d);
    headerCells.push(
      '<div class="gantt-day-header' + (iso === todayIso ? " today" : "") + '" style="width:' + DAY_WIDTH + 'px">' + (d.getMonth() + 1) + "/" + d.getDate() + "</div>"
    );
  }
  els.scrollHeader.innerHTML = headerCells.join("");

  const sorted = [...wbsItems].sort((a, b) => {
    const ai = a.category_id && catIndexMap.has(a.category_id) ? catIndexMap.get(a.category_id) : 999;
    const bi = b.category_id && catIndexMap.has(b.category_id) ? catIndexMap.get(b.category_id) : 999;
    if (ai !== bi) return ai - bi;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  els.frozenBody.innerHTML = sorted.map((w) => {
    const t = w.task;
    const part = PARTS[t.part];
    const cat = w.category_id ? categories.find((c) => c.id === w.category_id) : null;
    const catColor = w.category_id && catIndexMap.has(w.category_id) ? CATEGORY_COLORS[catIndexMap.get(w.category_id) % 8] : "var(--border)";
    return (
      '<div class="gantt-row" data-id="' + t.id + '" style="--cat-color:' + catColor + '">' +
        '<div class="gantt-fcol gantt-fcol-wbs">' + escapeHtml(w.wbs_code || "-") + "</div>" +
        '<div class="gantt-fcol gantt-fcol-cat">' + (cat ? escapeHtml(cat.name) : "-") + "</div>" +
        '<div class="gantt-fcol gantt-fcol-part"><span class="dot" style="background:' + part.color + '"></span>' + part.label + "</div>" +
        '<div class="gantt-fcol gantt-fcol-title" title="' + escapeHtml(t.title) + '">' + escapeHtml(t.title) + "</div>" +
        '<div class="gantt-fcol gantt-fcol-owner">' + escapeHtml(t.owner) + "</div>" +
      "</div>"
    );
  }).join("");

  els.scrollBody.innerHTML = sorted.map((w) => {
    const t = w.task;
    const left = dayOffset(t.start_date) * DAY_WIDTH;
    const width = (daysBetween(parseISO(t.start_date), parseISO(t.end_date)) + 1) * DAY_WIDTH;
    const st = STATUS[t.status];
    return (
      '<div class="gantt-row" data-id="' + t.id + '">' +
        '<div class="gantt-bar" data-id="' + t.id + '" style="left:' + left + "px;width:" + width + 'px;background:' + st.color + '">' +
          '<span class="gantt-bar-handle left" data-mode="resize-left"></span>' +
          '<span class="gantt-bar-handle right" data-mode="resize-right"></span>' +
        "</div>" +
      "</div>"
    );
  }).join("");

  els.scrollBody.querySelectorAll(".gantt-bar").forEach((bar) => {
    bar.addEventListener("pointerdown", (e) => startDrag(e, bar, "move"));
  });
  els.scrollBody.querySelectorAll(".gantt-bar-handle").forEach((handle) => {
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
