import { fetchTasks } from "./data.js";
import { PARTS, PART_ORDER, STATUS, escapeHtml, ddayInfo, dateRangeHTML, progressBarHTML } from "./util.js";
import { ADMIN_CODE } from "./config.js";
import * as wbsAdmin from "./wbsAdmin.js";
import * as ganttAdmin from "./ganttAdmin.js";

const els = {};
let allTasks = [];
let view = "home"; // "home" | "total" | "done" | "doing" | "overdue" | "wbsAdmin" | "gantt"
let adminUnlocked = false;

function byDate(key, dir){
  return (a, b) => dir * (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

const VIEWS = {
  total:   { label: "총 작업",   filter: () => true, sort: byDate("start_date", -1), sortNote: "시작일 최신순" },
  done:    { label: "작업완료",   filter: (t) => t.status === "done", sort: byDate("end_date", -1), sortNote: "종료예정일 최신순" },
  doing:   { label: "작업중",     filter: (t) => t.status === "doing", sort: byDate("end_date", 1), sortNote: "마감 임박·지연 순" },
  overdue: { label: "지연",       filter: (t) => { const dd = ddayInfo(t); return dd && dd.tone === "critical"; }, sort: byDate("end_date", 1), sortNote: "지연 오래된 순" }
};

export function init(isAdminInitial){
  adminUnlocked = !!isAdminInitial;
  els.homeBtn = document.getElementById("monitorHomeBtn");
  els.statGrid = document.getElementById("statGrid");
  els.homeView = document.getElementById("monitorHomeView");
  els.listView = document.getElementById("monitorListView");
  els.listTitle = document.getElementById("monitorListTitle");
  els.tableBody = document.getElementById("monitorTableBody");
  els.ring = document.getElementById("overallRing");
  els.ringValue = document.getElementById("overallRingValue");
  els.partBars = document.getElementById("partBars");

  els.adminWbsBtn = document.getElementById("adminWbsBtn");
  els.adminGanttBtn = document.getElementById("adminGanttBtn");
  els.adminWbsView = document.getElementById("adminWbsView");
  els.adminGanttView = document.getElementById("adminGanttView");
  els.adminModeBtn = document.getElementById("adminModeBtn");
  els.adminLoginPopover = document.getElementById("adminLoginPopover");
  els.adminLoginForm = document.getElementById("adminLoginForm");
  els.adminCodeInput = document.getElementById("adminCodeInput");
  els.adminLoginError = document.getElementById("adminLoginError");

  wbsAdmin.init();
  ganttAdmin.init();

  els.homeBtn.addEventListener("click", () => { view = "home"; render(); });
  els.statGrid.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-view]");
    if (!tile) return;
    view = tile.dataset.view;
    render();
  });

  els.adminWbsBtn.addEventListener("click", async () => {
    view = "wbsAdmin";
    render();
    await wbsAdmin.refresh();
  });
  els.adminGanttBtn.addEventListener("click", async () => {
    view = "gantt";
    render();
    await ganttAdmin.refresh();
  });

  updateAdminButtons();
  els.adminModeBtn.addEventListener("click", () => {
    if (adminUnlocked){
      view = "wbsAdmin";
      render();
      wbsAdmin.refresh();
      return;
    }
    els.adminLoginPopover.hidden = !els.adminLoginPopover.hidden;
    els.adminCodeInput.value = "";
    els.adminLoginError.textContent = "";
    if (!els.adminLoginPopover.hidden) els.adminCodeInput.focus();
  });
  document.addEventListener("click", (e) => {
    if (els.adminLoginPopover.hidden) return;
    const path = e.composedPath();
    if (!path.includes(els.adminLoginPopover) && !path.includes(els.adminModeBtn)){
      els.adminLoginPopover.hidden = true;
    }
  });
  els.adminLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (els.adminCodeInput.value.trim() !== ADMIN_CODE){
      els.adminLoginError.textContent = "코드가 올바르지 않습니다.";
      return;
    }
    adminUnlocked = true;
    els.adminLoginPopover.hidden = true;
    updateAdminButtons();
    view = "wbsAdmin";
    render();
    await wbsAdmin.refresh();
  });
}

function updateAdminButtons(){
  els.adminWbsBtn.hidden = !adminUnlocked;
  els.adminGanttBtn.hidden = !adminUnlocked;
  els.adminModeBtn.textContent = adminUnlocked ? "관리자모드 켜짐" : "관리자모드";
  els.adminModeBtn.classList.toggle("active", adminUnlocked);
}

export async function refresh(){
  els.statGrid.innerHTML = statTile("총 작업", "…", "total");
  try {
    allTasks = await fetchTasks();
  } catch (err){
    els.statGrid.innerHTML = '<div class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</div>";
    return;
  }
  render();
  if (view === "wbsAdmin") wbsAdmin.refresh();
  if (view === "gantt") ganttAdmin.refresh();
}

function render(){
  const total = allTasks.length;
  const done = allTasks.filter((t) => t.status === "done").length;
  const doing = allTasks.filter((t) => t.status === "doing").length;
  const overdue = allTasks.filter((t) => { const dd = ddayInfo(t); return dd && dd.tone === "critical"; }).length;

  els.statGrid.innerHTML =
    statTile("총 작업", total, "total") +
    statTile("작업완료", done, "done") +
    statTile("작업중", doing, "doing") +
    statTile("지연", overdue, "overdue", overdue > 0);

  els.statGrid.querySelectorAll("[data-view]").forEach((tile) => {
    tile.classList.toggle("active", tile.dataset.view === view);
  });
  els.homeBtn.classList.toggle("active", view === "home");
  els.adminWbsBtn.classList.toggle("active", view === "wbsAdmin");
  els.adminGanttBtn.classList.toggle("active", view === "gantt");

  const isListView = view === "total" || view === "done" || view === "doing" || view === "overdue";
  document.body.classList.toggle("admin-wide-mode", view === "wbsAdmin" || view === "gantt");
  els.homeView.style.display = view === "home" ? "" : "none";
  els.listView.style.display = isListView ? "" : "none";
  els.adminWbsView.style.display = view === "wbsAdmin" ? "" : "none";
  els.adminGanttView.style.display = view === "gantt" ? "" : "none";
  els.statGrid.style.display = (view === "wbsAdmin" || view === "gantt") ? "none" : "";

  if (view === "home") renderHome(total, done);
  else if (isListView) renderList();
}

function renderHome(total, done){
  const pct = total ? Math.round((done / total) * 100) : 0;
  els.ring.style.setProperty("--pct", pct);
  els.ringValue.textContent = pct + "%";

  els.partBars.innerHTML = PART_ORDER.map((key) => {
    const partTasks = allTasks.filter((t) => t.part === key);
    const partDone = partTasks.filter((t) => t.status === "done").length;
    const partPct = partTasks.length ? Math.round((partDone / partTasks.length) * 100) : 0;
    return (
      '<div class="part-bar-row">' +
        '<div class="part-bar-label"><span class="dot" style="background:' + PARTS[key].color + '"></span>' + PARTS[key].label + "</div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + partPct + "%;background:" + PARTS[key].color + '"></div></div>' +
        '<div class="part-bar-frac">' + partDone + "/" + partTasks.length + " · " + partPct + "%</div>" +
      "</div>"
    );
  }).join("");
}

function renderList(){
  const cfg = VIEWS[view];
  const rows = allTasks.filter(cfg.filter).sort(cfg.sort);
  els.listTitle.textContent = cfg.label + " (" + rows.length + "건) · " + cfg.sortNote;

  if (rows.length === 0){
    els.tableBody.innerHTML = '<tr><td colspan="8" class="empty">해당하는 작업이 없습니다.</td></tr>';
    return;
  }

  els.tableBody.innerHTML = rows.map((t) => {
    const part = PARTS[t.part];
    const st = STATUS[t.status];
    const dd = ddayInfo(t);
    return (
      "<tr>" +
        '<td class="col-title">' + escapeHtml(t.title) + "</td>" +
        '<td class="col-part"><span class="dot" style="background:' + part.color + '"></span>' + part.label + "</td>" +
        '<td class="col-owner">' + escapeHtml(t.owner) + "</td>" +
        '<td class="col-period">' + dateRangeHTML(t.start_date, t.end_date) + "</td>" +
        "<td>" + st.label + "</td>" +
        '<td class="col-progress">' + progressBarHTML(t.progress) + "</td>" +
        '<td class="col-dday">' + (dd ? dd.label : "-") + "</td>" +
        "<td>" + (t.description ? escapeHtml(t.description) : "-") + "</td>" +
      "</tr>"
    );
  }).join("");
}

function statTile(label, value, viewKey, crit){
  return (
    '<button type="button" class="stat-tile" data-view="' + viewKey + '">' +
      '<div class="stat-label">' + label + "</div>" +
      '<div class="stat-value' + (crit ? " crit" : "") + '">' + value + "</div>" +
    "</button>"
  );
}
