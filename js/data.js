// 데이터 접근 레이어: 화면 코드는 이 함수들만 호출하고, Supabase 호출은 전부 여기에 모아둔다.
import { supabase } from "./supabaseClient.js";
import { ATTACHMENTS_BUCKET } from "./config.js";

export async function fetchTasks(){
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTask(task){
  const { data, error } = await supabase.from("tasks").insert(task).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, patch){
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id){
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPosts(){
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createPost(post){
  const { data, error } = await supabase.from("posts").insert(post).select().single();
  if (error) throw error;
  return data;
}

export async function updatePost(id, patch){
  const { data, error } = await supabase.from("posts").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePost(id){
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadAttachment(file){
  const path = Date.now() + "_" + file.name.replace(/[^\w.\-]/g, "_");
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}

// ---------- 관리자모드: WBS 대분류 ----------
export async function fetchCategories(){
  const { data, error } = await supabase.from("wbs_categories").select("*").order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory(category){
  const { data, error } = await supabase.from("wbs_categories").insert(category).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, patch){
  const { data, error } = await supabase.from("wbs_categories").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id){
  const { error } = await supabase.from("wbs_categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------- 관리자모드: WBS 항목 (tasks와 1:1, task 필드는 join으로만 읽음) ----------
export async function fetchWbsItems(){
  const { data, error } = await supabase
    .from("wbs_items")
    .select("*, task:tasks(*)")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

// 아직 WBS에 연결되지 않은 일정(작업)만 골라내기 - 기존 작업을 WBS로 "승격"할 때 쓴다.
export async function fetchUnlinkedTasks(){
  const [tasks, wbsItems] = await Promise.all([fetchTasks(), fetchWbsItems()]);
  const linked = new Set(wbsItems.map((w) => w.task_id));
  return tasks.filter((t) => !linked.has(t.id));
}

export async function createWbsItemForExistingTask(taskId, wbsFields){
  const payload = Object.assign({ task_id: taskId }, wbsFields);
  const { data, error } = await supabase.from("wbs_items").insert(payload).select("*, task:tasks(*)").single();
  if (error) throw error;
  return data;
}

// WBS 항목 + 연결될 작업을 한 번에 새로 만든다. 두 번째 insert가 실패하면
// 방금 만든 task를 되돌려서(rollback) 고아 데이터가 남지 않게 한다.
export async function createWbsItemWithNewTask(taskFields, wbsFields){
  const task = await createTask(taskFields);
  try {
    return await createWbsItemForExistingTask(task.id, wbsFields);
  } catch (err){
    await deleteTask(task.id).catch(() => {});
    throw err;
  }
}

export async function updateWbsItem(id, patch){
  const { data, error } = await supabase.from("wbs_items").update(patch).eq("id", id).select("*, task:tasks(*)").single();
  if (error) throw error;
  return data;
}

export async function bulkUpdateWbsItems(ids, patch){
  const { error } = await supabase.from("wbs_items").update(patch).in("id", ids);
  if (error) throw error;
}

// WBS 항목 삭제 = 연결된 작업(task)까지 함께 삭제 (1:1이므로 WBS 항목만 남기는 건 의미가 없다).
// tasks -> wbs_items가 on delete cascade라서, task를 지우면 wbs_items 행도 자동으로 같이 사라진다.
export async function deleteWbsItemAndTask(taskId){
  await deleteTask(taskId);
}
