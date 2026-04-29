/** API client — llamadas REST al backend Express en DigitalOcean */

const API_URL = '/api';

// --- Auth token management ---
let authToken: string | null = localStorage.getItem('auth_token');
let currentUser: AuthUser | null = null;
const authListeners: Array<(user: AuthUser | null) => void> = [];

export type Role = 'admin' | 'teacher' | 'student';

export interface AuthUser {
  id: string;
  full_name: string;
  /** Rol primario (para compatibilidad con código existente). Tras RBAC multi-rol, usar `roles` para decisiones. */
  role: Role;
  roles: Role[];
  email: string;
  /** Flag Plan C: true cuando admin generó password temporal — frontend debe forzar cambio. */
  must_change_password?: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  /** Rol primario (compat). Para decisiones multi-rol usar `roles`. */
  role: Role;
  roles: Role[];
  email?: string;
  created_at?: string;
  artstation_url?: string | null;
  instagram_url?: string | null;
  bio?: string | null;
  /** Flag Plan C: true cuando admin generó password temporal. */
  must_change_password?: boolean;
}

/** Usuario devuelto por GET /api/admin/users (incluye array agregado de roles). */
export interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  roles: Role[];
}

/** Relación profesor↔estudiante devuelta por GET /api/teacher/students. */
export interface TeacherStudent {
  id: string;
  full_name: string;
  email: string;
  cohort: string | null;
  assigned_at: string | null;
  /** Solo presente cuando el solicitante es admin. */
  teacher_id?: string | null;
  teacher_name?: string | null;
}

// --- Role helpers (safe frente a user null/undefined) ---
export function hasRole(user: { roles?: Role[]; role?: Role } | null | undefined, role: Role): boolean {
  if (!user) return false;
  if (user.roles && user.roles.includes(role)) return true;
  // Fallback por si el backend aún no envió `roles` (durante soft migration)
  return user.role === role;
}

export function isAdmin(user: { roles?: Role[]; role?: Role } | null | undefined): boolean {
  return hasRole(user, 'admin');
}

export function isTeacher(user: { roles?: Role[]; role?: Role } | null | undefined): boolean {
  return hasRole(user, 'teacher');
}

export function isStudent(user: { roles?: Role[]; role?: Role } | null | undefined): boolean {
  return hasRole(user, 'student');
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
  // Showcase v3.3.0 — versión Marmoset Toolbag opcional. Si hay mview_url,
  // el modelo tiene una vista alternativa (PBR avanzado) y el modal muestra
  // un carrusel para alternar entre .glb (estudiante) y .mview (docente).
  mview_url?: string | null;
  mview_thumbnail_url?: string | null;
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
  role: Role;
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
    currentUser = {
      id: profile.id,
      full_name: profile.full_name,
      role: profile.role,
      roles: profile.roles ?? [profile.role],
      email: profile.email || '',
      must_change_password: profile.must_change_password === true,
    };
    return { user: currentUser, profile };
  } catch {
    signOut();
    return { user: null, profile: null };
  }
}

/**
 * Limpia el flag must_change_password del currentUser en memoria.
 * Se llama tras un changePassword exitoso para cerrar el modal forzado
 * sin necesidad de re-login (el backend ya puso el flag a false en DB).
 */
export function clearMustChangePassword() {
  if (currentUser) {
    currentUser = { ...currentUser, must_change_password: false };
    notifyAuthListeners();
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

// =====================================================================
// Showcase v3.3.0 — enriquece un modelo del estudiante con su versión
// Marmoset Toolbag (.mview). Solo admin/teacher; el backend valida RBAC.
// =====================================================================

export async function uploadShowcase(
  modelId: string,
  mviewFile: File,
  thumbnailFile?: File
): Promise<ModelRow> {
  const formData = new FormData();
  formData.append('mview', mviewFile);
  // Thumbnail es OPCIONAL — Marmoset Toolbag puede embebir un poster en el
  // propio .mview, o el frontend cae al thumbnail del .glb del estudiante.
  if (thumbnailFile) formData.append('thumbnail', thumbnailFile);
  return apiFetch<ModelRow>(`/models/${modelId}/showcase`, {
    method: 'POST',
    body: formData,
  });
}

export async function removeShowcase(modelId: string): Promise<ModelRow> {
  return apiFetch<ModelRow>(`/models/${modelId}/showcase`, { method: 'DELETE' });
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

// --- Password reset ---
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch<{ ok: boolean; message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

/**
 * Cambio de password por el propio usuario autenticado (Plan C flow).
 * Requiere current_password para verificación anti-hijack.
 * El backend limpia must_change_password=false al completarse.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

// --- Admin: gestión de usuarios y roles ---
export async function getAdminUsers(): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>('/admin/users');
}

export async function assignRole(userId: string, role: Role): Promise<boolean> {
  try {
    await apiFetch<{ ok: boolean }>(`/admin/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeRole(userId: string, role: Role): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: boolean }>(`/admin/users/${userId}/roles/${role}`, {
      method: 'DELETE',
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message };
  }
}

/**
 * Admin crea un usuario nuevo con password temporal generada por backend.
 * Response incluye `temp_password` en claro — mostrar UNA VEZ al admin
 * para que copie y envíe por Teams (Plan C). El usuario creado queda con
 * must_change_password=true y debe cambiarla en su primer login.
 */
export async function adminCreateUser(input: {
  email: string;
  full_name: string;
  role: Role;
}): Promise<{ user: AdminUser; temp_password: string }> {
  return apiFetch<{ user: AdminUser; temp_password: string }>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/**
 * Admin resetea la password de un usuario existente.
 * Backend genera una nueva password temporal (retornada en claro UNA VEZ),
 * marca must_change_password=true y limpia tokens de reset self-service
 * pendientes.
 */
export async function adminResetUserPassword(userId: string): Promise<{ temp_password: string }> {
  return apiFetch<{ temp_password: string }>(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
  });
}

// --- Teacher/Admin: relación profesor↔estudiante ---
export async function getTeacherStudents(): Promise<TeacherStudent[]> {
  return apiFetch<TeacherStudent[]>('/teacher/students');
}

export async function assignStudentToTeacher(
  teacherId: string,
  studentId: string,
  cohort?: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<{ ok: boolean }>('/admin/teacher-students', {
      method: 'POST',
      body: JSON.stringify({ teacher_id: teacherId, student_id: studentId, cohort: cohort ?? null }),
    });
    return { ok: true };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.message };
  }
}

export async function unassignStudentFromTeacher(teacherId: string, studentId: string): Promise<boolean> {
  try {
    await apiFetch<{ ok: boolean }>(`/admin/teacher-students/${teacherId}/${studentId}`, {
      method: 'DELETE',
    });
    return true;
  } catch {
    return false;
  }
}
