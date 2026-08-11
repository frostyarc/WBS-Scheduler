import { fetchTasks, createTask, updateTask, deleteTask } from "./data.js";
import { PARTS, PART_ORDER, STATUS, escapeHtml, ddayInfo, showToast, toISO, today, addDays, parseISO, downloadCSV } from "./util.js";

let tasks = [];
let viewMode = "all";
let viewValue = "all";
let editingTaskId = null;

const els = {};

export async function init(){
  els.form = document.getElementById("taskForm");
  els.formToggle = document.getElementById("taskFormToggle");
  els.formChevron = document.getElementById("taskFormChevron");
  els.formTitle = document.getElementById("formTitle");
  els.submitBtn = document.getElementById("taskSubmitBtn");
  els.cancelEditBtn = document.getElementById("cancelEditBtn");
  els.owner = document.getElementById("f-owner");
  els.viewModeRow = document.getElementById("viewModeRow");
  els.densityRow = document.getElementById("densityRow");
  els.viewFilterArea = document.getElementById("viewFilterArea");
  els.resultCount = document.getElementById("resultCount");
  els.taskList = document.getElementById("taskList");
  els.exportBtn = document.getElementById("exportTasksBtn");

  els.form.addEventListener("submit", onSubmit);
  els.cancelEditBtn.addEventListener("click", resetForm);
  els.exportBtn.addEventListener("click", exportCSV);
  els.formToggle.addEventListener("click", () => setFormExpanded(els.form.hidden));
  els.viewModeRow.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.viewModeRow.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      viewMode = btn.dataset.view;
      viewValue = viewMode === "date" ? toISO(today()) : "all";
      render();
    });
  });
  els.densityRow.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      els.densityRow.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      els.taskList.classList.toggle("compact", btn.dataset.density === "compact");
    });
  });

  await refresh();
}

function setFormExpanded(expanded){
  els.form.hidden = !expanded;
  els.formToggle.setAttribute("aria-expanded", String(expanded));
  els.formChevron.textContent = expanded ? "▾" : "▸";
}

export async function refresh(){
  els.taskList.innerHTML = '<div class="empty">불러오는 중...</div>';
  try {
    tasks = await fetchTasks();
  } catch (err){
    els.taskList.innerHTML = '<div class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</div>";
    showToast("일정을 불러오지 못했습니다", true);
    return;
  }
  render();
}

function resetForm(){
  els.form.reset();
  document.getElementById("f-status").value = "ready";
  editingTaskId = null;
  els.formTitle.textContent = "새 작업 등록";
  els.submitBtn.textContent = "작업 등록";
  els.cancelEditBtn.style.display = "none";
}

function startEdit(t){
  setFormExpanded(true);
  editingTaskId = t.id;
  document.getElementById("f-title").value = t.title;
  document.getElementById("f-part").value = t.part;
  els.owner.value = t.owner;
  document.getElementById("f-start").value = t.start_date;
  document.getElementById("f-end").value = t.end_date;
  document.getElementById("f-status").value = t.status;
  document.getElementById("f-desc").value = t.description || "";
  els.formTitle.textContent = "작업 수정";
  els.submitBtn.textContent = "수정 완료";
  els.cancelEditBtn.style.display = "inline-block";
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function onSubmit(e){
  e.preventDefault();
  const start = document.getElementById("f-start").value;
  const end = document.getElementById("f-end").value;
  if (start && end && end < start){
    alert("종료예정일은 시작일보다 빠를 수 없습니다.");
    return;
  }
  const payload = {
    title: document.getElementById("f-title").value.trim(),
    part: document.getElementById("f-part").value,
    owner: els.owner.value.trim(),
    status: document.getElementById("f-status").value,
    start_date: start,
    end_date: end,
    description: document.getElementById("f-desc").value.trim()
  };
  els.submitBtn.disabled = true;
  try {
    if (editingTaskId){
      await updateTask(editingTaskId, payload);
      showToast("작업을 수정했습니다");
    } else {
      await createTask(payload);
      showToast("작업을 등록했습니다");
    }
    resetForm();
    await refresh();
  } catch (err){
    showToast("저장 실패: " + err.message, true);
  } finally {
    els.submitBtn.disabled = false;
  }
}

function uniqueOwners(){
  const seen = new Set();
  tasks.forEach((t) => { if (t.owner) seen.add(t.owner); });
  return Array.from(seen).sort();
}

function renderViewFilterArea(){
  if (viewMode === "all"){
    els.viewFilterArea.innerHTML = "";
    return;
  }
  if (viewMode === "date"){
    els.viewFilterArea.innerHTML =
      '<div class="date-filter-nav">' +
        '<input type="date" id="viewDateInput" value="' + viewValue + '" />' +
        '<button type="button" class="btn ghost" data-nav="-1">◀ 이전날</button>' +
        '<button type="button" class="btn ghost" data-nav="0">오늘</button>' +
        '<button type="button" class="btn ghost" data-nav="1">다음날 ▶</button>' +
      "</div>";
    document.getElementById("viewDateInput").addEventListener("change", function(){
      viewValue = this.value;
      render();
    });
    els.viewFilterArea.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.dataset.nav);
        viewValue = n === 0 ? toISO(today()) : toISO(addDays(parseISO(viewValue), n));
        render();
      });
    });
    return;
  }
  if (viewMode === "part"){
    const chips = ['<button class="chip' + (viewValue === "all" ? " active" : "") + '" data-val="all">전체 파트</button>'];
    PART_ORDER.forEach((key) => {
      chips.push('<button class="chip' + (viewValue === key ? " active" : "") + '" data-val="' + key + '"><span class="dot" style="background:' + PARTS[key].color + '"></span>' + PARTS[key].label + "</button>");
    });
    els.viewFilterArea.innerHTML = '<div class="filter-row">' + chips.join("") + "</div>";
  }
  if (viewMode === "member"){
    const owners = uniqueOwners();
    const chips = ['<button class="chip' + (viewValue === "all" ? " active" : "") + '" data-val="all">전체 멤버</button>'];
    owners.forEach((name) => {
      chips.push('<button class="chip' + (viewValue === name ? " active" : "") + '" data-val="' + escapeHtml(name) + '">' + escapeHtml(name) + "</button>");
    });
    els.viewFilterArea.innerHTML = '<div class="filter-row">' + chips.join("") + "</div>";
  }
  if (viewMode === "status"){
    const statusKeys = ["all", "ready", "doing", "done", "overdue"];
    const labels = { all: "전체 상태", ready: "준비중", doing: "작업중", done: "작업완료", overdue: "지연" };
    const chips = statusKeys.map((key) => '<button class="chip' + (viewValue === key ? " active" : "") + '" data-val="' + key + '">' + labels[key] + "</button>");
    els.viewFilterArea.innerHTML = '<div class="filter-row">' + chips.join("") + "</div>";
  }
  els.viewFilterArea.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      viewValue = chip.dataset.val;
      render();
    });
  });
}

function exportCSV(){
  const rows = [["작업이름", "작업구분", "담당자", "작업현황", "시작일", "종료예정일", "D-day", "작업설명"]];
  getFilteredTasks().forEach((t) => {
    const dd = ddayInfo(t);
    rows.push([t.title, PARTS[t.part].label, t.owner, STATUS[t.status].label, t.start_date, t.end_date, dd ? dd.label : "", t.description || ""]);
  });
  downloadCSV("wps_일정_" + toISO(today()) + ".csv", rows);
  showToast("CSV 파일을 내려받았습니다");
}

function getFilteredTasks(){
  if (viewMode === "date"){
    return tasks.filter((t) => t.start_date <= viewValue && viewValue <= t.end_date);
  }
  if (viewMode === "part" && viewValue !== "all"){
    return tasks.filter((t) => t.part === viewValue);
  }
  if (viewMode === "member" && viewValue !== "all"){
    return tasks.filter((t) => t.owner === viewValue);
  }
  if (viewMode === "status" && viewValue !== "all"){
    if (viewValue === "overdue") return tasks.filter((t) => { const dd = ddayInfo(t); return dd && dd.tone === "critical"; });
    return tasks.filter((t) => t.status === viewValue);
  }
  return tasks;
}

function render(){
  renderViewFilterArea();
  const filtered = getFilteredTasks();
  els.resultCount.textContent = "총 " + filtered.length + "건의 작업";

  if (filtered.length === 0){
    els.taskList.innerHTML = '<div class="empty">조건에 맞는 작업이 없습니다.</div>';
    return;
  }

  els.taskList.innerHTML = filtered.map((t) => {
    const part = PARTS[t.part];
    const st = STATUS[t.status];
    const dd = ddayInfo(t);
    const ddDot = dd ? (dd.tone === "critical" ? "var(--status-critical)" : dd.tone === "warning" ? "var(--status-warning)" : "var(--text-muted)") : "";
    return (
      '<div class="task-row" data-id="' + t.id + '">' +
        '<div class="task-main">' +
          '<div class="task-line task-line-part">' +
            '<span class="task-part"><span class="dot" style="background:' + part.color + '"></span>' + part.label + "</span>" +
            '<span class="task-dates">' + t.start_date + " → " + t.end_date + "</span>" +
          "</div>" +
          '<div class="task-line task-line-title">' +
            '<p class="task-title">' + escapeHtml(t.title) + "</p>" +
            '<span class="task-owner">담당 ' + escapeHtml(t.owner) + "</span>" +
          "</div>" +
          (t.description ? '<p class="task-desc">' + escapeHtml(t.description) + "</p>" : "") +
        "</div>" +
        '<div class="task-side">' +
          '<div class="task-status-row">' +
            '<span class="pill"><span class="dot" style="background:' + st.color + '"></span>' + st.label + "</span>" +
            (dd ? '<span class="dday"><span class="dot" style="background:' + ddDot + '"></span>' + dd.label + "</span>" : "") +
          "</div>" +
          '<div class="task-controls">' +
            '<select data-action="status">' +
              Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (k === t.status ? " selected" : "") + ">" + STATUS[k].label + "</option>").join("") +
            "</select>" +
            '<button type="button" class="btn ghost" data-action="edit">수정</button>' +
            '<button type="button" class="btn danger" data-action="delete">삭제</button>' +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }).join("");

  els.taskList.querySelectorAll('[data-action="status"]').forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.closest(".task-row").dataset.id;
      try {
        await updateTask(id, { status: sel.value });
        showToast("상태를 변경했습니다");
        await refresh();
      } catch (err){
        showToast("변경 실패: " + err.message, true);
      }
    });
  });
  els.taskList.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".task-row").dataset.id;
      const t = tasks.find((x) => x.id === id);
      if (t) startEdit(t);
    });
  });
  els.taskList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".task-row").dataset.id;
      if (!confirm("이 작업을 삭제할까요?")) return;
      try {
        await deleteTask(id);
        if (editingTaskId === id) resetForm();
        showToast("작업을 삭제했습니다");
        await refresh();
      } catch (err){
        showToast("삭제 실패: " + err.message, true);
      }
    });
  });
}
