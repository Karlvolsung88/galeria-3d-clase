import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lvvleptxcddwhgmvxjdq.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2dmxlcHR4Y2Rkd2hnbXZ4amRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODkxODksImV4cCI6MjA5MDE2NTE4OX0.1i_ndruVn01x27Udr3LBxquQxVe6c_rz-xuFvhdedCo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// getSession() puede colgarse indefinidamente en Edge cuando hay una sesión
// en localStorage y Enhanced Security Mode bloquea el refresh del token.
// Este wrapper garantiza que init() siempre avanza — si no resuelve en 5s,
// trata la sesión como null y carga los datos públicos de todas formas.
export async function getSessionSafe() {
  return Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null }; error: null }>((resolve) =>
      setTimeout(() => resolve({ data: { session: null }, error: null }), 5000)
    ),
  ]);
}

export interface ModelRow {
  id: string;
  title: string;
  student: string;
  category: string;
  description: string;
  tags: string[];
  file_name: string;
  file_url: string;
  file_size: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  sort_order?: number;
}

export interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  created_at: string;
  artstation_url?: string | null;
  instagram_url?: string | null;
  bio?: string | null;
}

export interface CommentRow {
  id: string;
  user_id: string;
  model_id: string;
  text: string;
  created_at: string;
  profiles?: { full_name: string; role: string };
}

export async function getUserProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  return data ?? null;
}

// --- Likes ---

export async function fetchCommentCounts(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('comments')
    .select('model_id');

  if (!data) return {};
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.model_id] = (counts[row.model_id] || 0) + 1;
  }
  return counts;
}

export async function fetchLikeCounts(): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('likes')
    .select('model_id');

  if (!data) return {};
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.model_id] = (counts[row.model_id] || 0) + 1;
  }
  return counts;
}

export async function fetchUserLikes(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('likes')
    .select('model_id')
    .eq('user_id', userId);

  return new Set((data || []).map((r) => r.model_id));
}

export async function toggleLike(modelId: string, userId: string, currentlyLiked: boolean) {
  if (currentlyLiked) {
    await supabase.from('likes').delete().eq('user_id', userId).eq('model_id', modelId);
  } else {
    await supabase.from('likes').insert({ user_id: userId, model_id: modelId });
  }
}

// --- Comments ---

export async function fetchComments(modelId: string): Promise<CommentRow[]> {
  const { data: comments } = await supabase
    .from('comments')
    .select('*')
    .eq('model_id', modelId)
    .order('created_at', { ascending: true });

  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p) => [p.id, { full_name: p.full_name, role: p.role }]));

  return comments.map((c) => ({ ...c, profiles: profileMap.get(c.user_id) })) as CommentRow[];
}

export async function addComment(modelId: string, userId: string, text: string): Promise<CommentRow | null> {
  const { data: comment } = await supabase
    .from('comments')
    .insert({ model_id: modelId, user_id: userId, text })
    .select('*')
    .single();

  if (!comment) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', userId)
    .single();

  return { ...comment, profiles: profile ?? undefined } as CommentRow;
}

export async function deleteComment(commentId: string) {
  await supabase.from('comments').delete().eq('id', commentId);
}

// --- Skills ---

export const SKILLS = [
  { key: 'modelado_3d',     label: 'Modelado 3D'       },
  { key: 'escultura',       label: 'Escultura Digital'  },
  { key: 'uv_mapping',      label: 'UV Mapping'         },
  { key: 'texturizado_pbr', label: 'Texturizado PBR'    },
  { key: 'optimizacion',    label: 'Optimización'       },
  { key: 'renderizado',     label: 'Renderizado'        },
] as const;

export type SkillKey = typeof SKILLS[number]['key'];

export interface StudentSkill {
  skill_name: SkillKey;
  value: number;
}

export interface StudentWithSkills {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  student_skills: StudentSkill[];
  artstation_url?: string | null;
  instagram_url?: string | null;
  bio?: string | null;
}

export async function fetchAllStudentsWithSkills(): Promise<StudentWithSkills[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      role,
      artstation_url,
      instagram_url,
      bio,
      student_skills ( skill_name, value )
    `)
    .eq('role', 'student')
    .order('full_name');

  if (error) {
    console.error('Error fetching students with skills:', error);
    return [];
  }

  return (data ?? []) as StudentWithSkills[];
}

export async function fetchStudentSkills(userId: string): Promise<StudentSkill[]> {
  const { data, error } = await supabase
    .from('student_skills')
    .select('skill_name, value')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching student skills:', error);
    return [];
  }

  return (data ?? []) as StudentSkill[];
}

export async function updateProfile(
  userId: string,
  fields: { full_name?: string; bio?: string | null; artstation_url?: string | null; instagram_url?: string | null }
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    return false;
  }
  return true;
}

export async function updateStudentLinks(
  userId: string,
  artstation: string | null,
  instagram: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ artstation_url: artstation || null, instagram_url: instagram || null })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating student links:', error);
    return false;
  }
  return true;
}

// --- Model ordering ---

export async function updateModelOrder(updates: { id: string; sort_order: number }[]): Promise<boolean> {
  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase.from('models').update({ sort_order }).eq('id', id)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error('Error updating model order:', failed.error);
    return false;
  }
  return true;
}

// --- Skills ---

export async function upsertStudentSkills(
  userId: string,
  skills: { skill_name: SkillKey; value: number }[]
): Promise<boolean> {
  const rows = skills.map((s) => ({
    user_id: userId,
    skill_name: s.skill_name,
    value: s.value,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('student_skills')
    .upsert(rows, { onConflict: 'user_id,skill_name' });

  if (error) {
    console.error('Error upserting student skills:', error);
    return false;
  }

  return true;
}
