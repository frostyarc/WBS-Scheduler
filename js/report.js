import { fetchPosts, createPost, updatePost, deletePost, uploadAttachment } from "./data.js";
import { DOW, pad, toISO, addDays, today, parseISO, daysInMonth, escapeHtml, showToast, downloadCSV } from "./util.js";

const MONTH_NAMES = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

let posts = [];
let selectedDate = toISO(today());
let viewYear = today().getFullYear();
let viewMonth = today().getMonth() + 1; // 1-indexed
let editingPostId = null;

const els = {};

export function init(){
  els.monthLabelBtn = document.getElementById("monthLabelBtn");
  els.monthPicker = document.getElementById("monthPicker");
  els.dateStrip = document.getElementById("dateStrip");
  els.dateTitle = document.getElementById("reportDateTitle");
  els.newPostBtn = document.getElementById("newPostBtn");
  els.form = document.getElementById("postForm");
  els.cancelBtn = document.getElementById("cancelPostBtn");
  els.submitBtn = document.getElementById("postSubmitBtn");
  els.existingAttachNote = document.getElementById("existingAttachNote");
  els.postList = document.getElementById("postList");
  els.exportBtn = document.getElementById("exportPostsBtn");

  els.exportBtn.addEventListener("click", exportCSV);

  document.querySelectorAll("[data-day-nav]").forEach((btn) => {
    btn.addEventListener("click", () => shiftDay(Number(btn.dataset.dayNav)));
  });
  els.monthLabelBtn.addEventListener("click", () => {
    els.monthPicker.hidden = !els.monthPicker.hidden;
  });
  document.addEventListener("click", (e) => {
    if (els.monthPicker.hidden) return;
    const path = e.composedPath();
    if (!path.includes(els.monthPicker) && !path.includes(els.monthLabelBtn)){
      els.monthPicker.hidden = true;
    }
  });

  els.newPostBtn.addEventListener("click", () => {
    const hidden = els.form.style.display === "none" || !els.form.style.display;
    if (hidden){
      editingPostId = null;
      els.form.reset();
      els.submitBtn.textContent = "게시";
      els.existingAttachNote.textContent = "";
      els.form.style.display = "flex";
    } else {
      resetForm();
    }
  });
  els.cancelBtn.addEventListener("click", resetForm);
  els.form.addEventListener("submit", onSubmit);
}

function shiftDay(delta){
  const d = addDays(parseISO(selectedDate), delta);
  selectedDate = toISO(d);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
  renderPanel();
}

function resetForm(){
  els.form.reset();
  els.form.style.display = "none";
  editingPostId = null;
  els.submitBtn.textContent = "게시";
  els.existingAttachNote.textContent = "";
}

function startEdit(p){
  editingPostId = p.id;
  document.getElementById("p-author").value = p.author;
  document.getElementById("p-title").value = p.title;
  document.getElementById("p-content").value = p.content;
  document.getElementById("p-link").value = p.drive_link || "";
  els.existingAttachNote.textContent = p.attachment_name ? "기존 첨부: " + p.attachment_name + " (새 파일을 선택하지 않으면 유지됩니다)" : "";
  els.submitBtn.textContent = "수정 완료";
  els.form.style.display = "flex";
  els.form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function onSubmit(e){
  e.preventDefault();
  const fileInput = document.getElementById("p-file");
  const file = fileInput.files && fileInput.files[0];

  els.submitBtn.disabled = true;
  try {
    let attachment = null;
    if (file) attachment = await uploadAttachment(file);

    if (editingPostId){
      const patch = {
        author: document.getElementById("p-author").value.trim(),
        title: document.getElementById("p-title").value.trim(),
        content: document.getElementById("p-content").value.trim(),
        drive_link: document.getElementById("p-link").value.trim(),
        edited: true
      };
      if (attachment){
        patch.attachment_url = attachment.url;
        patch.attachment_name = attachment.name;
      }
      await updatePost(editingPostId, patch);
      showToast("글을 수정했습니다");
    } else {
      const now = new Date();
      await createPost({
        post_date: selectedDate,
        title: document.getElementById("p-title").value.trim(),
        author: document.getElementById("p-author").value.trim(),
        time: pad(now.getHours()) + ":" + pad(now.getMinutes()),
        content: document.getElementById("p-content").value.trim(),
        attachment_url: attachment ? attachment.url : null,
        attachment_name: attachment ? attachment.name : null,
        drive_link: document.getElementById("p-link").value.trim(),
        edited: false
      });
      showToast("글을 게시했습니다");
    }
    resetForm();
    await refresh();
  } catch (err){
    showToast("저장 실패: " + err.message, true);
  } finally {
    els.submitBtn.disabled = false;
  }
}

function exportCSV(){
  if (posts.length === 0){
    showToast("내보낼 보고서가 없습니다", true);
    return;
  }
  const rows = [["날짜", "제목", "작성자", "작성시간", "내용", "첨부파일명", "드라이브링크", "수정여부"]];
  posts.forEach((p) => {
    rows.push([p.post_date, p.title, p.author, p.time, p.content, p.attachment_name || "", p.drive_link || "", p.edited ? "Y" : "N"]);
  });
  downloadCSV("wps_보고서_" + toISO(today()) + ".csv", rows);
  showToast("CSV 파일을 내려받았습니다");
}

function countsByDate(){
  const counts = {};
  posts.forEach((p) => { counts[p.post_date] = (counts[p.post_date] || 0) + 1; });
  return counts;
}

function renderMonthLabel(){
  els.monthLabelBtn.textContent = viewYear + "년 " + MONTH_NAMES[viewMonth - 1];

  els.monthPicker.innerHTML =
    '<div class="month-picker-year">' +
      '<button type="button" data-year-nav="-1">◀</button>' +
      "<span>" + viewYear + "년</span>" +
      '<button type="button" data-year-nav="1">▶</button>' +
    "</div>" +
    '<div class="month-picker-grid">' +
      MONTH_NAMES.map((name, i) =>
        '<button type="button" data-pick-month="' + (i + 1) + '" class="' + (i + 1 === viewMonth ? "active" : "") + '">' + name + "</button>"
      ).join("") +
    "</div>";

  els.monthPicker.querySelectorAll("[data-year-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewYear += Number(btn.dataset.yearNav);
      renderPanel();
    });
  });
  els.monthPicker.querySelectorAll("[data-pick-month]").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewMonth = Number(btn.dataset.pickMonth);
      els.monthPicker.hidden = true;
      renderPanel();
    });
  });
}

function renderDateStrip(){
  const t0 = today();
  const total = daysInMonth(viewYear, viewMonth);
  const counts = countsByDate();
  const html = [];
  for (let day = 1; day <= total; day++){
    const d = new Date(viewYear, viewMonth - 1, day);
    const iso = toISO(d);
    let cls = "date-chip";
    if (iso === toISO(t0)) cls += " today";
    if (iso === selectedDate) cls += " selected";
    const count = counts[iso] || 0;
    html.push(
      '<button type="button" class="' + cls + '" data-date="' + iso + '">' +
        '<div class="dow">' + DOW[d.getDay()] + "</div>" +
        '<div class="dnum">' + day + "</div>" +
        (count > 0 ? '<span class="date-chip-count">' + count + "</span>" : "") +
      "</button>"
    );
  }
  els.dateStrip.innerHTML = html.join("");
  els.dateStrip.querySelectorAll(".date-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedDate = chip.dataset.date;
      renderPanel();
    });
  });
}

function renderPanel(){
  renderMonthLabel();
  renderDateStrip();
  const d = parseISO(selectedDate);
  els.dateTitle.textContent = d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + DOW[d.getDay()] + "요일";

  const dayPosts = posts.filter((p) => p.post_date === selectedDate);
  if (dayPosts.length === 0){
    els.postList.innerHTML = '<div class="empty">이 날짜에 작성된 보고서가 없습니다.</div>';
    return;
  }
  els.postList.innerHTML = dayPosts.map((p) => {
    let attachHtml = "";
    if (p.attachment_url) attachHtml += '<a class="attach-chip" href="' + escapeHtml(p.attachment_url) + '" target="_blank" rel="noopener">첨부 · ' + escapeHtml(p.attachment_name || "파일") + "</a>";
    if (p.drive_link) attachHtml += '<a class="attach-chip" href="' + escapeHtml(p.drive_link) + '" target="_blank" rel="noopener">드라이브 링크</a>';
    return (
      '<article class="post" data-id="' + p.id + '">' +
        '<div class="post-head">' +
          "<div>" +
            '<p class="post-title">' + escapeHtml(p.title) + "</p>" +
            '<div class="post-meta">' + escapeHtml(p.author) + " · " + p.time + (p.edited ? " · 수정됨" : "") + "</div>" +
          "</div>" +
          '<div class="post-actions">' +
            '<button type="button" class="btn ghost" data-action="edit">수정</button>' +
            '<button type="button" class="btn danger" data-action="delete">삭제</button>' +
          "</div>" +
        "</div>" +
        '<p class="post-content">' + escapeHtml(p.content) + "</p>" +
        attachHtml +
      "</article>"
    );
  }).join("");

  els.postList.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".post").dataset.id;
      const p = posts.find((x) => x.id === id);
      if (p) startEdit(p);
    });
  });
  els.postList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.closest(".post").dataset.id;
      if (!confirm("이 글을 삭제할까요?")) return;
      try {
        await deletePost(id);
        if (editingPostId === id) resetForm();
        showToast("글을 삭제했습니다");
        await refresh();
      } catch (err){
        showToast("삭제 실패: " + err.message, true);
      }
    });
  });
}

export async function refresh(){
  els.postList.innerHTML = '<div class="empty">불러오는 중...</div>';
  try {
    posts = await fetchPosts();
  } catch (err){
    els.postList.innerHTML = '<div class="empty">불러오기 실패: ' + escapeHtml(err.message) + "</div>";
    return;
  }
  renderPanel();
}
