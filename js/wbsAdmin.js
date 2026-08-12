// 관리자모드: WBS 디테일 (엑셀 느낌의 편집 그리드).
// tasks 테이블은 data.js의 updateTask()를 통해서만 건드리고, WBS 전용 필드는
// wbs_items를 통해서만 건드린다 - 일정등록/모니터링 쪽 코드는 이 파일이 전혀 참조하지 않는다.
import {
  fetchCategories, createCategory, updateCategory, deleteCategory,
  fetchWbsItems, fetchUnlinkedTasks,
  createWbsItemForExistingTask, createWbsItemWithNewTask,
  updateWbsItem, bulkUpdateWbsItems, deleteWbsItemAndTask,
  updateTask
} from "./data.js";
import {
  PARTS, PART_ORDER, STATUS, PROGRESS_STEPS,
  escapeHtml, taskDuration, showToast, downloadCSV, toISO, today
} from "./util.js";

const CATEGORY_COLORS = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];

// 완료조건/리스크이슈/지원요청은 wbs_items 소유, 작업설명은 tasks 소유 - 상세 패널이 어느
// updateXxx()를 불러야 하는지 알아야 해서 필드별 소속을 여기 한 곳에 정리해둔다.
const FIELD_SCOPE = { completion_criteria: "wbs", risk_issue: "wbs", support_request: "wbs", description: "task" };
const FIELD_LABELS = { completion_criteria: "완료조건", risk_issue: "리스크/이슈", support_request: "지원요청", description: "작업설명" };

let categories = [];
let wbsItems = [];
let unlinkedTasks = [];
let addMode = "existing";
let selectedIds = new Set();
let lastClickedId = null;
let predecessorPopoverFor = null;
let detailPanelFor = null;

const els = {};

export function init(){
  els.categoryToggle = document.getElementById("wbsCategoryToggle");
  els.categoryChevron = document.getElementById("wbsCategoryChevron");
  els.categoryBody = document.getElementById("wbsCategoryBody");
  els.categoryManager = document.getElementById("wbsCategoryManager");
  els.categoryAddForm = document.getElementById("wbsCategoryAddForm");
  els.categoryNameInput = document.getElementById("wbsCategoryNameInput");

  els.categoryToggle.addEventListener("click", () => {
    const expanding = els.categoryBody.hidden;
    els.categoryBody.hidden = !expanding;
    els.categoryToggle.setAttribute("aria-expanded", String(expanding));
    els.categoryChevron.textContent = expanding ? "▾" : "▸";
  });

  els.addToggle = document.getElementById("wbsAddToggle");
  els.addChevron = document.getElementById("wbsAddChevron");
  els.addForm = document.getElementById("wbsAddForm");
  els.addModeRow = document.getElementById("wbsAddModeRow");
  els.addFields = document.getElementById("wbsAddFields");
  els.addSubmit = document.getElementById("wbsAddSubmit");

  els.bulkBar = document.getElementById("wbsBulkBar");
  els.selectAll = document.getElementById("wbsSelectAll");
  els.tableBody = document.getElementById("wbsTableBody");
  els.exportBtn = document.getElementById("wbsExportBtn");
  els.detailModal = document.getElementById("wbsDetailModal");

  els.detailModal.addEventListener("click", (e) => {
    if (e.target === els.detailModal || e.target.closest('[data-action="close-detail"]')){
      detailPanelFor = null;
      renderDetailModal();
    }
  });

  els.categoryAddForm.addEventListener("submit", onAddCategory);

  els.addToggle.addEventListener("click", () => {
    const expanding = els.addForm.hidden;
    els.addForm.hidden = !expanding;
    els.addToggle.setAttribute("aria-expanded", String(expanding));
    els.addChevron.textContent = expanding ? "▾" : "▸";
    if (expanding) renderAddFields();
  });
  els.addModeRow.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.addModeRow.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      addMode = btn.dataset.addMode;
      renderAddFields();
    });
  });
  els.addSubmit.addEventListener("click", onSubmitAdd);

  els.selectAll.addEventListener("change", () => {
    if (els.selectAll.checked) wbsItems.forEach((w) => selectedIds.add(w.id));
    else selectedIds.clear();
    renderTable();
  });
  els.exportBtn.addEventListener("click", exportCSV);
}

export async function refresh(){
  els.tableBody.innerHTML = '<tr><td colspan="' + MAIN_COLS + '" class="empty">불러오는 중...</td></tr>';
  try {
    [categories, wbsItems, unlinkedTasks] = await Promise.all([
      fetchCategories(), fetchWbsItems(), fetchUnlinkedTasks()
    ]);
  } catch (err){
    els.tableBody.innerHTML = '<tr><td colspan="' + MAIN_COLS + '" class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</td></tr>";
    return;
  }
  selectedIds = new Set(Array.from(selectedIds).filter((id) => wbsItems.some((w) => w.id === id)));
  if (detailPanelFor && !wbsItems.some((w) => w.id === detailPanelFor.id)) detailPanelFor = null;
  renderCategoryManager();
  if (!els.addForm.hidden) renderAddFields();
  renderTable();
  renderDetailModal();
}

function wbsById(id){
  return wbsItems.find((w) => w.id === id);
}

// ---------- 대분류 관리 ----------
function renderCategoryManager(){
  els.categoryManager.innerHTML = categories.length
    ? categories.map((c, i) => (
        '<div class="wbs-category-chip" data-id="' + c.id + '">' +
          '<span class="dot" style="background:' + CATEGORY_COLORS[i % 8] + '"></span>' +
          '<input type="text" class="wbs-category-name" value="' + escapeHtml(c.name) + '" data-action="rename" />' +
          '<button type="button" class="btn ghost" data-action="up"' + (i === 0 ? " disabled" : "") + ">▲</button>" +
          '<button type="button" class="btn ghost" data-action="down"' + (i === categories.length - 1 ? " disabled" : "") + ">▼</button>" +
          '<button type="button" class="btn danger" data-action="delete-cat">삭제</button>' +
        "</div>"
      )).join("")
    : '<div class="empty">대분류가 아직 없습니다. 아래에서 추가해주세요.</div>';

  els.categoryManager.querySelectorAll('[data-action="rename"]').forEach((input) => {
    input.addEventListener("change", async () => {
      const id = input.closest(".wbs-category-chip").dataset.id;
      try {
        await updateCategory(id, { name: input.value.trim() });
        showToast("대분류 이름을 변경했습니다");
        await refresh();
      } catch (err){ showToast("변경 실패: " + err.message, true); }
    });
  });
  els.categoryManager.querySelectorAll('[data-action="delete-cat"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".wbs-category-chip").dataset.id;
      if (!confirm("이 대분류를 삭제할까요? 이 대분류로 지정된 WBS 항목은 '대분류 없음'이 됩니다.")) return;
      try {
        await deleteCategory(id);
        showToast("대분류를 삭제했습니다");
        await refresh();
      } catch (err){ showToast("삭제 실패: " + err.message, true); }
    });
  });
  els.categoryManager.querySelectorAll('[data-action="up"], [data-action="down"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".wbs-category-chip").dataset.id;
      const dir = btn.dataset.action === "up" ? -1 : 1;
      const idx = categories.findIndex((c) => c.id === id);
      const neighbor = categories[idx + dir];
      if (!neighbor) return;
      const a = categories[idx];
      try {
        await Promise.all([
          updateCategory(a.id, { sort_order: neighbor.sort_order }),
          updateCategory(neighbor.id, { sort_order: a.sort_order })
        ]);
        await refresh();
      } catch (err){ showToast("순서 변경 실패: " + err.message, true); }
    });
  });
}

async function onAddCategory(e){
  e.preventDefault();
  const name = els.categoryNameInput.value.trim();
  if (!name) return;
  const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1);
  try {
    await createCategory({ name, sort_order: maxOrder + 1 });
    els.categoryAddForm.reset();
    showToast("대분류를 추가했습니다");
    await refresh();
  } catch (err){ showToast("추가 실패: " + err.message, true); }
}

// ---------- 새 WBS 항목 추가 ----------
function renderAddFields(){
  const categoryOptions = '<option value="">(없음)</option>' +
    categories.map((c) => '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>").join("");
  const partOptions = PART_ORDER.map((k) => '<option value="' + k + '">' + PARTS[k].label + "</option>").join("");
  const statusOptions = Object.keys(STATUS).map((k) => '<option value="' + k + '">' + STATUS[k].label + "</option>").join("");
  const progressOptions = PROGRESS_STEPS.map((p) => '<option value="' + p + '">' + p + "%</option>").join("");

  const wbsFieldsHTML =
    '<div class="form-grid">' +
      '<div class="field"><label>대분류</label><select id="wbs-f-category">' + categoryOptions + "</select></div>" +
      '<div class="field"><label>WBS 코드</label><input type="text" id="wbs-f-code" placeholder="예: 1.1" /></div>' +
      '<div class="field span-2"><label>부/지원</label><input type="text" id="wbs-f-support" placeholder="이름, 이름" /></div>' +
      '<div class="field span-2"><label>완료조건</label><input type="text" id="wbs-f-criteria" /></div>' +
      '<div class="field span-2"><label>리스크/이슈</label><input type="text" id="wbs-f-risk" /></div>' +
      '<div class="field span-2"><label>지원요청</label><input type="text" id="wbs-f-support-req" /></div>' +
    "</div>";

  if (addMode === "existing"){
    const taskOptions = unlinkedTasks.map((t) =>
      '<option value="' + t.id + '">' + escapeHtml(t.title) + " (" + escapeHtml(t.owner) + ")</option>"
    ).join("");
    els.addFields.innerHTML =
      '<div class="field">' +
        "<label>연결할 작업 (일정등록에 이미 있는 작업 중, 아직 WBS에 없는 것만 표시)</label>" +
        '<select id="wbs-f-task">' + (unlinkedTasks.length ? taskOptions : '<option value="">연결 가능한 작업이 없습니다</option>') + "</select>" +
      "</div>" +
      wbsFieldsHTML;
  } else {
    els.addFields.innerHTML =
      '<div class="form-grid">' +
        '<div class="field span-2"><label>작업 이름</label><input type="text" id="wbs-f-title" required /></div>' +
        '<div class="field"><label>작업 구분</label><select id="wbs-f-part">' + partOptions + "</select></div>" +
        '<div class="field"><label>담당자</label><input type="text" id="wbs-f-owner" required /></div>' +
        '<div class="field"><label>시작일</label><input type="date" id="wbs-f-start" required /></div>' +
        '<div class="field"><label>종료일</label><input type="date" id="wbs-f-end" required /></div>' +
        '<div class="field"><label>상태</label><select id="wbs-f-status">' + statusOptions + "</select></div>" +
        '<div class="field"><label>진행률</label><select id="wbs-f-progress">' + progressOptions + "</select></div>" +
        '<div class="field span-4"><label>작업설명</label><textarea id="wbs-f-desc"></textarea></div>' +
      "</div>" +
      wbsFieldsHTML;
  }

  const catSelect = document.getElementById("wbs-f-category");
  const codeInput = document.getElementById("wbs-f-code");
  catSelect.addEventListener("change", () => {
    if (!catSelect.value) return;
    const idx = categories.findIndex((c) => c.id === catSelect.value);
    const countInCat = wbsItems.filter((w) => w.category_id === catSelect.value).length;
    codeInput.value = (idx + 1) + "." + (countInCat + 1);
  });
}

async function onSubmitAdd(){
  const wbsFields = {
    category_id: document.getElementById("wbs-f-category").value || null,
    wbs_code: document.getElementById("wbs-f-code").value.trim() || null,
    support_members: document.getElementById("wbs-f-support").value.trim() || null,
    completion_criteria: document.getElementById("wbs-f-criteria").value.trim() || null,
    risk_issue: document.getElementById("wbs-f-risk").value.trim() || null,
    support_request: document.getElementById("wbs-f-support-req").value.trim() || null
  };
  try {
    if (addMode === "existing"){
      const taskSelect = document.getElementById("wbs-f-task");
      if (!taskSelect.value){ showToast("연결할 작업을 선택해주세요", true); return; }
      await createWbsItemForExistingTask(taskSelect.value, wbsFields);
    } else {
      const title = document.getElementById("wbs-f-title").value.trim();
      const owner = document.getElementById("wbs-f-owner").value.trim();
      const start = document.getElementById("wbs-f-start").value;
      const end = document.getElementById("wbs-f-end").value;
      if (!title || !owner || !start || !end){ showToast("필수 항목을 입력해주세요", true); return; }
      if (end < start){ showToast("종료일은 시작일보다 빠를 수 없습니다", true); return; }
      await createWbsItemWithNewTask(
        {
          title, owner, start_date: start, end_date: end,
          description: document.getElementById("wbs-f-desc").value.trim(),
          part: document.getElementById("wbs-f-part").value,
          status: document.getElementById("wbs-f-status").value,
          progress: Number(document.getElementById("wbs-f-progress").value)
        },
        wbsFields
      );
    }
    showToast("WBS 항목을 추가했습니다");
    els.addForm.hidden = true;
    els.addToggle.setAttribute("aria-expanded", "false");
    els.addChevron.textContent = "▸";
    await refresh();
  } catch (err){
    showToast("추가 실패: " + err.message, true);
  }
}

// ---------- 선행작업 ----------
function predecessorCellHTML(w){
  const chips = (w.predecessor_ids || []).map((pid) => {
    const p = wbsById(pid);
    if (!p) return "";
    const st = STATUS[p.task.status];
    const isDone = p.task.status === "done";
    return (
      '<span class="wbs-pred-chip' + (isDone ? " done" : "") + '" title="' + escapeHtml(p.task.title) + '">' +
        (isDone ? '<span class="wbs-pred-check">✓</span>' : "") +
        (p.wbs_code ? escapeHtml(p.wbs_code) + " · " : "") +
        '<span class="dot" style="background:' + st.color + '"></span>' + st.label + " " + (p.task.progress || 0) + "%" +
      "</span>"
    );
  }).join("");
  return (
    '<div class="wbs-pred-cell" data-id="' + w.id + '">' +
      chips +
      '<button type="button" class="btn ghost" data-action="edit-pred">+</button>' +
      predecessorPopoverHTML(w) +
    "</div>"
  );
}

function predecessorPopoverHTML(w){
  if (predecessorPopoverFor !== w.id) return "";
  const options = wbsItems.filter((x) => x.id !== w.id).map((x) => {
    const checked = (w.predecessor_ids || []).includes(x.id) ? " checked" : "";
    return (
      '<label class="wbs-pred-option"><input type="checkbox" data-pred-id="' + x.id + '"' + checked + " />" +
        (x.wbs_code ? escapeHtml(x.wbs_code) + " · " : "") + escapeHtml(x.task.title) +
      "</label>"
    );
  }).join("") || '<div class="empty">다른 WBS 항목이 없습니다.</div>';
  return (
    '<div class="wbs-pred-popover">' + options +
      '<button type="button" class="btn secondary" data-action="close-pred">닫기</button>' +
    "</div>"
  );
}

// ---------- 표 ----------
// 항목당 한 줄로만 표시 (간트차트처럼 행 높이를 줄여 심플하게) - 완료조건/리스크이슈/
// 지원요청/작업설명처럼 자주 안 보는 긴 텍스트는 표 밖의 상세 패널(모달)에서 확인/수정한다.
const MAIN_COLS = 14;

// 완료조건/리스크이슈/지원요청/작업설명 - 작은 버튼으로만 표시, 클릭하면 상세 패널에서 텍스트
// 확인/수정. 내용이 있으면 하이라이트, 없으면 회색. 완료조건 버튼에는 "작업완료+진행률100%"와
// 서로 맞물리는 체크박스도 붙는다.
function flagButtonsHTML(w){
  const t = w.task;
  const isDone = t.status === "done" && (t.progress || 0) === 100;
  const flag = (key) => {
    const value = FIELD_SCOPE[key] === "task" ? t[key] : w[key];
    const has = !!(value && value.trim());
    return '<button type="button" class="wbs-flag-btn' + (has ? " has-content" : "") + '" data-action="open-field" data-field-key="' + key + '">' + FIELD_LABELS[key] + "</button>";
  };
  return (
    '<span class="wbs-flag-done-wrap">' +
      '<input type="checkbox" class="wbs-flag-checkbox" data-action="toggle-done"' + (isDone ? " checked" : "") + " />" +
      flag("completion_criteria") +
    "</span>" +
    flag("risk_issue") +
    flag("support_request") +
    flag("description")
  );
}

function rowHTML(w, catIndexMap){
  const t = w.task;
  const part = PARTS[t.part];
  const catColor = w.category_id && catIndexMap.has(w.category_id) ? CATEGORY_COLORS[catIndexMap.get(w.category_id) % 8] : "transparent";
  const dur = taskDuration(t.start_date, t.end_date);
  const checked = selectedIds.has(w.id) ? " checked" : "";
  return (
    '<tr class="wbs-row" data-id="' + w.id + '" style="--cat-color:' + catColor + '">' +
      '<td><input type="checkbox" data-action="select"' + checked + " /></td>" +
      '<td><input type="text" class="wbs-inline-input wbs-code-input" data-field="wbs_code" data-scope="wbs" value="' + escapeHtml(w.wbs_code || "") + '" /></td>' +
      '<td><select data-field="category_id" data-scope="wbs">' +
        '<option value="">(없음)</option>' +
        categories.map((c) => '<option value="' + c.id + '"' + (c.id === w.category_id ? " selected" : "") + ">" + escapeHtml(c.name) + "</option>").join("") +
      "</select></td>" +
      '<td><select data-field="part" data-scope="task">' +
        PART_ORDER.map((k) => '<option value="' + k + '"' + (k === t.part ? " selected" : "") + ">" + PARTS[k].label + "</option>").join("") +
      "</select></td>" +
      '<td><input type="text" class="wbs-inline-input" data-field="title" data-scope="task" value="' + escapeHtml(t.title) + '" /></td>' +
      '<td><input type="text" class="wbs-inline-input" data-field="owner" data-scope="task" value="' + escapeHtml(t.owner) + '" /></td>' +
      '<td><input type="text" class="wbs-inline-input" data-field="support_members" data-scope="wbs" value="' + escapeHtml(w.support_members || "") + '" /></td>' +
      '<td class="wbs-pred-td">' + predecessorCellHTML(w) + "</td>" +
      '<td><input type="date" data-field="start_date" data-scope="task" value="' + t.start_date + '" /></td>' +
      '<td><input type="date" data-field="end_date" data-scope="task" value="' + t.end_date + '" /></td>' +
      '<td class="col-duration">' + (dur !== null ? dur + "일" : "-") + "</td>" +
      '<td><select data-field="status" data-scope="task">' +
        Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (k === t.status ? " selected" : "") + ">" + STATUS[k].label + "</option>").join("") +
      "</select></td>" +
      '<td><select data-field="progress" data-scope="task">' +
        PROGRESS_STEPS.map((p) => '<option value="' + p + '"' + (p === (t.progress || 0) ? " selected" : "") + ">" + p + "%</option>").join("") +
      "</select></td>" +
      '<td class="wbs-row-flags">' + flagButtonsHTML(w) + "</td>" +
    "</tr>"
  );
}

function renderTable(){
  if (wbsItems.length === 0){
    els.tableBody.innerHTML = '<tr><td colspan="' + MAIN_COLS + '" class="empty">WBS 항목이 없습니다. 위에서 추가해보세요.</td></tr>';
    renderBulkBar();
    return;
  }
  const catIndexMap = new Map(categories.map((c, i) => [c.id, i]));
  const sorted = [...wbsItems].sort((a, b) => {
    const ai = a.category_id && catIndexMap.has(a.category_id) ? catIndexMap.get(a.category_id) : 999;
    const bi = b.category_id && catIndexMap.has(b.category_id) ? catIndexMap.get(b.category_id) : 999;
    if (ai !== bi) return ai - bi;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  els.tableBody.innerHTML = sorted.map((w) => rowHTML(w, catIndexMap)).join("");
  els.selectAll.checked = selectedIds.size > 0 && selectedIds.size === wbsItems.length;

  wireRowEvents();
  renderBulkBar();
}

function wireRowEvents(){
  els.tableBody.querySelectorAll('[data-action="select"]').forEach((cb) => {
    cb.addEventListener("click", (e) => {
      const id = cb.closest(".wbs-row").dataset.id;
      const rows = Array.from(els.tableBody.querySelectorAll(".wbs-row"));
      if (e.shiftKey && lastClickedId){
        const ids = rows.map((r) => r.dataset.id);
        const from = ids.indexOf(lastClickedId);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1){
          const [lo, hi] = from < to ? [from, to] : [to, from];
          for (let i = lo; i <= hi; i++) selectedIds.add(ids[i]);
        }
      } else if (cb.checked){
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
      lastClickedId = id;
      renderTable();
    });
  });

  els.tableBody.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("change", async () => {
      const w = wbsById(field.closest(".wbs-row").dataset.id);
      const key = field.dataset.field;
      const scope = field.dataset.scope;
      let value = field.value;
      if (key === "progress") value = Number(value);
      if (key === "category_id") value = value || null;

      try {
        if (scope === "task"){
          if (key === "end_date" && value < w.task.start_date){
            showToast("종료일은 시작일보다 빠를 수 없습니다", true);
            field.value = w.task.end_date;
            return;
          }
          if (key === "start_date" && value > w.task.end_date){
            showToast("시작일은 종료일보다 늦을 수 없습니다", true);
            field.value = w.task.start_date;
            return;
          }
          await updateTask(w.task_id, { [key]: value });
        } else {
          await updateWbsItem(w.id, { [key]: value === "" ? null : value });
        }
        await refresh();
      } catch (err){
        showToast("저장 실패: " + err.message, true);
      }
    });
  });

  els.tableBody.querySelectorAll('[data-action="open-field"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      detailPanelFor = { id: btn.closest(".wbs-row").dataset.id, field: btn.dataset.fieldKey };
      renderDetailModal();
    });
  });

  els.tableBody.querySelectorAll('[data-action="toggle-done"]').forEach((cb) => {
    cb.addEventListener("change", async () => {
      const w = wbsById(cb.closest(".wbs-row").dataset.id);
      try {
        if (cb.checked){
          await updateTask(w.task_id, { status: "done", progress: 100 });
        } else {
          await updateTask(w.task_id, { status: "doing", progress: 75 });
        }
        await refresh();
      } catch (err){
        showToast("변경 실패: " + err.message, true);
        cb.checked = !cb.checked;
      }
    });
  });

  els.tableBody.querySelectorAll('[data-action="edit-pred"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".wbs-pred-cell").dataset.id;
      predecessorPopoverFor = predecessorPopoverFor === id ? null : id;
      renderTable();
    });
  });
  els.tableBody.querySelectorAll('[data-action="close-pred"]').forEach((btn) => {
    btn.addEventListener("click", () => { predecessorPopoverFor = null; renderTable(); });
  });
  els.tableBody.querySelectorAll("[data-pred-id]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const w = wbsById(predecessorPopoverFor);
      const set = new Set(w.predecessor_ids || []);
      if (cb.checked) set.add(cb.dataset.predId);
      else set.delete(cb.dataset.predId);
      try {
        await updateWbsItem(w.id, { predecessor_ids: Array.from(set) });
        await refresh();
      } catch (err){ showToast("저장 실패: " + err.message, true); }
    });
  });
}

// ---------- 상세 패널 (완료조건/리스크이슈/지원요청/작업설명 - 버튼 클릭 시 해당 항목 1개만) ----------
function renderDetailModal(){
  if (!detailPanelFor){
    els.detailModal.hidden = true;
    els.detailModal.innerHTML = "";
    return;
  }
  const w = wbsById(detailPanelFor.id);
  if (!w){
    els.detailModal.hidden = true;
    els.detailModal.innerHTML = "";
    return;
  }
  const key = detailPanelFor.field;
  const scope = FIELD_SCOPE[key];
  const currentValue = scope === "task" ? w.task[key] : w[key];
  els.detailModal.hidden = false;
  els.detailModal.innerHTML =
    '<div class="wbs-detail-modal-box">' +
      '<div class="wbs-detail-modal-header">' +
        '<h3>' + escapeHtml(w.task.title) + " · " + FIELD_LABELS[key] + "</h3>" +
        '<button type="button" class="btn ghost" data-action="close-detail">닫기</button>' +
      "</div>" +
      '<div class="wbs-detail-modal-fields">' +
        '<div class="wbs-detail-field"><textarea class="wbs-inline-input" data-field="' + key + '" autofocus>' + escapeHtml(currentValue || "") + "</textarea></div>" +
      "</div>" +
    "</div>";

  els.detailModal.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("change", async () => {
      try {
        if (scope === "task"){
          await updateTask(w.task_id, { [key]: field.value.trim() });
        } else {
          await updateWbsItem(w.id, { [key]: field.value.trim() || null });
        }
        await refresh();
      } catch (err){ showToast("저장 실패: " + err.message, true); }
    });
  });
}

// ---------- 일괄 편집 ----------
function renderBulkBar(){
  if (selectedIds.size === 0){
    els.bulkBar.hidden = true;
    els.bulkBar.innerHTML = "";
    return;
  }
  els.bulkBar.hidden = false;
  const categoryOptions = '<option value="">대분류 선택</option>' +
    categories.map((c) => '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>").join("");

  els.bulkBar.innerHTML =
    '<span class="wbs-bulk-count">' + selectedIds.size + "개 선택됨</span>" +
    '<select id="wbsBulkCategory">' + categoryOptions + "</select>" +
    '<button type="button" class="btn secondary" id="wbsBulkCategoryApply">대분류 일괄 적용</button>' +
    '<input type="text" id="wbsBulkSupport" placeholder="부/지원 일괄 입력" />' +
    '<button type="button" class="btn secondary" id="wbsBulkSupportApply">부/지원 일괄 적용</button>' +
    '<button type="button" class="btn ghost" id="wbsBulkClear">선택 취소</button>' +
    '<button type="button" class="btn danger" id="wbsBulkDelete">삭제</button>';

  document.getElementById("wbsBulkCategoryApply").addEventListener("click", async () => {
    const val = document.getElementById("wbsBulkCategory").value;
    if (!val){ showToast("대분류를 선택해주세요", true); return; }
    try {
      await bulkUpdateWbsItems(Array.from(selectedIds), { category_id: val });
      showToast(selectedIds.size + "개 항목의 대분류를 변경했습니다");
      await refresh();
    } catch (err){ showToast("변경 실패: " + err.message, true); }
  });
  document.getElementById("wbsBulkSupportApply").addEventListener("click", async () => {
    const val = document.getElementById("wbsBulkSupport").value.trim();
    try {
      await bulkUpdateWbsItems(Array.from(selectedIds), { support_members: val || null });
      showToast(selectedIds.size + "개 항목의 부/지원을 변경했습니다");
      await refresh();
    } catch (err){ showToast("변경 실패: " + err.message, true); }
  });
  document.getElementById("wbsBulkClear").addEventListener("click", () => {
    selectedIds.clear();
    renderTable();
  });
  document.getElementById("wbsBulkDelete").addEventListener("click", async () => {
    if (!confirm(selectedIds.size + "개의 WBS 항목과 연결된 작업을 함께 삭제할까요? (일정등록에서도 사라집니다)")) return;
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => deleteWbsItemAndTask(wbsById(id).task_id)));
      if (detailPanelFor && ids.includes(detailPanelFor.id)) detailPanelFor = null;
      selectedIds.clear();
      showToast("삭제했습니다");
      await refresh();
    } catch (err){ showToast("삭제 실패: " + err.message, true); }
  });
}

// ---------- 내보내기 ----------
function exportCSV(){
  if (wbsItems.length === 0){ showToast("내보낼 항목이 없습니다", true); return; }
  const rows = [["WBS", "대분류", "소분류", "작업명", "담당자", "부/지원", "시작일", "종료일", "기간", "상태", "진행률", "완료조건", "리스크/이슈", "지원요청"]];
  wbsItems.forEach((w) => {
    const t = w.task;
    const cat = categories.find((c) => c.id === w.category_id);
    rows.push([
      w.wbs_code || "", cat ? cat.name : "", PARTS[t.part].label, t.title, t.owner, w.support_members || "",
      t.start_date, t.end_date, taskDuration(t.start_date, t.end_date), STATUS[t.status].label, t.progress || 0,
      w.completion_criteria || "", w.risk_issue || "", w.support_request || ""
    ]);
  });
  downloadCSV("wbs_상세_" + toISO(today()) + ".csv", rows);
  showToast("CSV 파일을 내려받았습니다");
}
