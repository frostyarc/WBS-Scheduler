import { fetchTasks } from "./data.js";
import { PARTS, PART_ORDER, STATUS, escapeHtml, ddayInfo } from "./util.js";

const els = {};
let allTasks = [];
let view = "home"; // "home" | "total" | "done" | "doing" | "overdue"

function byDate(key, dir){
  return (a, b) => dir * (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
}

const VIEWS = {
  total:   { label: "총 작업",   filter: () => true, sort: byDate("start_date", -1), sortNote: "시작일 최신순" },
  done:    { label: "작업완료",   filter: (t) => t.status === "done", sort: byDate("end_date", -1), sortNote: "종료예정일 최신순" },
  doing:   { label: "작업중",     filter: (t) => t.status === "doing", sort: byDate("end_date", 1), sortNote: "마감 임박·지연 순" },
  overdue: { label: "지연",       filter: (t) => { const dd = ddayInfo(t); return dd && dd.tone === "critical"; }, sort: byDate("end_date", 1), sortNote: "지연 오래된 순" }
};

export function init(){
  els.homeBtn = document.getElementById("monitorHomeBtn");
  els.statGrid = document.getElementById("statGrid");
  els.homeView = document.getElementById("monitorHomeView");
  els.listView = document.getElementById("monitorListView");
  els.listTitle = document.getElementById("monitorListTitle");
  els.tableBody = document.getElementById("monitorTableBody");
  els.ring = document.getElementById("overallRing");
  els.ringValue = document.getElementById("overallRingValue");
  els.partBars = document.getElementById("partBars");

  els.homeBtn.addEventListener("click", () => { view = "home"; render(); });
  els.statGrid.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-view]");
    if (!tile) return;
    view = tile.dataset.view;
    render();
  });
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

  if (view === "home"){
    els.homeView.style.display = "";
    els.listView.style.display = "none";
    renderHome(total, done);
  } else {
    els.homeView.style.display = "none";
    els.listView.style.display = "";
    renderList();
  }
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
    els.tableBody.innerHTML = '<tr><td colspan="7" class="empty">해당하는 작업이 없습니다.</td></tr>';
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
        '<td class="col-period">' + t.start_date + " → " + t.end_date + "</td>" +
        "<td>" + st.label + "</td>" +
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
