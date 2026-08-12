import { isConfigured } from "./supabaseClient.js";
import { init as initAuthGate } from "./authGate.js";
import * as schedule from "./schedule.js";
import * as monitor from "./monitor.js";
import * as report from "./report.js";

function showSetupBanner(){
  const el = document.getElementById("setupBanner");
  el.style.display = "block";
  el.innerHTML =
    "<strong>Supabase 연결 정보가 아직 설정되지 않았습니다.</strong><br/>" +
    "<code>js/config.js</code> 파일을 열어 <code>SUPABASE_URL</code>과 <code>SUPABASE_ANON_KEY</code> 값을 " +
    "Supabase 프로젝트의 Project Settings → API 화면 값으로 바꿔주세요.";
}

function wireTabs(){
  const tabs = document.querySelectorAll('.tabs[role="tablist"] .tab');
  const panels = document.querySelectorAll(".panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "schedule") await schedule.refresh();
      if (tab.dataset.tab === "monitor") await monitor.refresh();
      if (tab.dataset.tab === "report") await report.refresh();
    });
  });
}

async function startApp(isAdmin){
  wireTabs();
  monitor.init(isAdmin);
  report.init();
  await schedule.init();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!isConfigured){
    showSetupBanner();
    return;
  }
  await initAuthGate(startApp);
});
