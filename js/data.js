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
