/** API client — llamadas REST al backend Express en DigitalOcean */

const API_URL = '/api';

// --- Auth token management ---
let authToken: string | null = localStorage.getItem('auth_token');
let currentUser: AuthUser | null = null;
const authListeners: Array<(user: AuthUser | null) => void> = [];

export interface AuthUser {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  email: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'student';
  email?: string;
  created_at?: string;
  artstation_url?: string | null;
  instagram_url?: string | null;
  bio?: string | null;
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
  thumbnail_url?: string | null;
}

export interface CommentRow {
  id: string;
  user_id: string;
  model_id: string;
  text: string;
  created_at: string;
  profiles?: { full_name: string; role: string };
}

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

export const SKILLS = [
  { key: 'modelado_3d',     label: 'Modelado 3D'       },
  { key: 'escultura',       label: 'Escultura Digital'  },
  { key: 'uv_mapping',      label: 'UV Mapping'         },
  { key: 'texturizado_pbr', label: 'Texturizado PBR'    },
  { key: 'optimizacion',    label: 'Optimización'       },
  { key: 'renderizado',     label: 'Renderizado'        },
] as const;

export type SkillKey = typeof SKILLS[number]['key'];

// --- Helper ---
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// --- Auth ---
export function onAuthStateChange(listener: (user: AuthUser | null) => void): () => void {
  authListeners.push(listener);
  return () => {
    const idx = authListeners.indexOf(listener);
    if (idx >= 0) authListeners.splice(idx, 1);
  };
}

function notifyAuthListeners() {
  for (const fn of authListeners) fn(currentUser);
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const data = await apiFetch<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  authToken = data.token;
  currentUser = data.user;
  localStorage.setItem('auth_token', data.token);
  notifyAuthListeners();
  return data;
}

export async function register(email: string, password: string, full_name: string): Promise<{ token: string; user: AuthUser }> {
  const data = await apiFetch<{ token: string; user: AuthUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name }),
  });
  authToken = data.token;
  currentUser = data.user;
  localStorage.setItem('auth_token', data.token);
  notifyAuthListeners();
  return data;
}

export function signOut() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('auth_token');
  notifyAuthListeners();
}

export async function getMe(): Promise<Profile | null> {
  if (!authToken) return null;
  try {
    return await apiFetch<Profile>('/auth/me');
  } catch {
    // Token expired or invalid
    signOut();
    return null;
  }
}

export function getToken(): string | null {
  return authToken;
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// Initialize — check if stored token is valid
export async function initAuth(): Promise<{ user: AuthUser | null; profile: Profile | null }> {
  if (!authToken) return { user: null, profile: null };
  try {
    const profile = await apiFetch<Profile>('/auth/me');
    currentUser = { id: profile.id, full_name: profile.full_name, role: profile.role, email: profile.email || '' };
    return { user: currentUser, profile };
  } catch {
    signOut();
    return { user: null, profile: null };
  }
}

// --- Models ---
export async function fetchModels(): Promise<ModelRow[]> {
  return apiFetch<ModelRow[]>('/models');
}

export async function createModel(formData: FormData): Promise<ModelRow> {
  return apiFetch<ModelRow>('/models', {
    method: 'POST',
    body: formData,
  });
}

export async function updateModel(id: string, data: Partial<ModelRow>): Promise<ModelRow> {
  return apiFetch<ModelRow>(`/models/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteModel(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/models/${id}`, { method: 'DELETE' });
}

export async function updateModelOrder(updates: { id: string; sort_order: number }[]): Promise<boolean> {
  try {
    await apiFetch<{ ok: boolean }>('/models/reorder', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function uploadThumbnail(modelId: string, blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('thumbnail', blob, 'thumb.webp');
  const data = await apiFetch<{ thumbnail_url: string }>(`/models/${modelId}/thumbnail`, {
    method: 'PUT',
    body: formData,
  });
  return data.thumbnail_url;
}

// --- Likes ---
export async function fetchLikeCounts(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/likes/counts');
}

export async function fetchUserLikes(): Promise<string[]> {
  return apiFetch<string[]>('/likes/user');
}

export async function toggleLike(modelId: string): Promise<{ liked: boolean }> {
  return apiFetch<{ liked: boolean }>('/likes/toggle', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId }),
  });
}

// --- Comments ---
export async function fetchCommentCounts(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>('/comments-counts');
}

export async function fetchComments(modelId: string): Promise<CommentRow[]> {
  return apiFetch<CommentRow[]>(`/comments/${modelId}`);
}

export async function addComment(modelId: string, text: string): Promise<CommentRow> {
  return apiFetch<CommentRow>('/comments', {
    method: 'POST',
    body: JSON.stringify({ model_id: modelId, text }),
  });
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/comments/${commentId}`, { method: 'DELETE' });
}

// --- Profiles ---
export async function fetchAllStudentsWithSkills(): Promise<StudentWithSkills[]> {
  return apiFetch<StudentWithSkills[]>('/profiles/students');
}

export async function updateProfile(
  userId: string,
  fields: { full_name?: string; bio?: string | null; artstation_url?: string | null; instagram_url?: string | null }
): Promise<boolean> {
  try {
    await apiFetch(`/profiles/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateStudentLinks(
  userId: string,
  artstation: string | null,
  instagram: string | null
): Promise<boolean> {
  return updateProfile(userId, { artstation_url: artstation, instagram_url: instagram });
}

export async function deleteStudentSkills(userId: string): Promise<boolean> {
  try {
    await apiFetch(`/skills/${userId}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

export async function deleteStudentProfile(userId: string): Promise<boolean> {
  try {
    await apiFetch(`/profiles/${userId}`, { method: 'DELETE' });
    return true;
  } catch {
    return false;
  }
}

// --- Skills ---
export async function upsertStudentSkills(
  userId: string,
  skills: { skill_name: SkillKey; value: number }[]
): Promise<boolean> {
  try {
    await apiFetch(`/skills/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ skills }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function fetchStudentSkills(userId: string): Promise<StudentSkill[]> {
  return apiFetch<StudentSkill[]>(`/skills/${userId}`);
}
