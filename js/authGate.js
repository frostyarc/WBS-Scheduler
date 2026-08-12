// 사이트 전체 접근 게이트: Supabase Auth로 실제 로그인해야 tasks/posts 등에 접근 가능.
// (RLS가 auth.role()='authenticated'를 요구하므로, 이 로그인 없이는 API를 직접 두드려도 막힌다.)
import { supabase } from "./supabaseClient.js";
import { SHARED_AUTH_EMAIL, ADMIN_AUTH_EMAIL } from "./config.js";

export async function init(onSuccess){
  const { data } = await supabase.auth.getSession();
  if (data.session){
    onSuccess(data.session.user.email === ADMIN_AUTH_EMAIL);
    return;
  }
  showGate(onSuccess);
}

function showGate(onSuccess){
  const gate = document.getElementById("authGate");
  const form = document.getElementById("authGateForm");
  const input = document.getElementById("authGateCode");
  const errorEl = document.getElementById("authGateError");
  const submitBtn = document.getElementById("authGateSubmit");

  gate.hidden = false;
  input.focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code) return;

    errorEl.textContent = "";
    submitBtn.disabled = true;

    let { error } = await supabase.auth.signInWithPassword({ email: SHARED_AUTH_EMAIL, password: code });
    let isAdmin = false;
    if (error){
      const adminAttempt = await supabase.auth.signInWithPassword({ email: ADMIN_AUTH_EMAIL, password: code });
      error = adminAttempt.error;
      isAdmin = !error;
    }
    submitBtn.disabled = false;

    if (error){
      errorEl.textContent = "코드가 올바르지 않습니다.";
      input.value = "";
      input.focus();
      return;
    }
    gate.hidden = true;
    onSuccess(isAdmin);
  });
}
