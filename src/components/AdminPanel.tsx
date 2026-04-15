import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  initAuth,
  getAdminUsers,
  assignRole,
  removeRole,
  getTeacherStudents,
  assignStudentToTeacher,
  unassignStudentFromTeacher,
  isAdmin,
  type AdminUser,
  type TeacherStudent,
  type Role,
} from '../lib/api';

const ALL_ROLES: Role[] = ['admin', 'teacher', 'student'];

type Feedback = { kind: 'ok' | 'error'; msg: string } | null;

export default function AdminPanel() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Form teacher↔student
  const [selTeacher, setSelTeacher] = useState<string>('');
  const [selStudent, setSelStudent] = useState<string>('');
  const [cohort, setCohort] = useState<string>('');

  // --- Bootstrap + protección ---
  useEffect(() => {
    (async () => {
      const { user } = await initAuth();
      if (!user) {
        navigate('/', { replace: true });
        return;
      }
      if (!isAdmin(user)) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([getAdminUsers(), getTeacherStudents()]);
      setUsers(u);
      setStudents(s);
    } catch (e) {
      setFeedback({ kind: 'error', msg: `No se pudo cargar: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  // --- Derivados ---
  const teachers = useMemo(
    () => users.filter((u) => u.roles.includes('teacher')),
    [users]
  );
  const studentUsers = useMemo(
    () => users.filter((u) => u.roles.includes('student')),
    [users]
  );

  // --- Acciones ---
  async function handleToggleRole(user: AdminUser, role: Role) {
    if (!confirm(
      user.roles.includes(role)
        ? `¿Quitar rol "${role}" a ${user.full_name}?`
        : `¿Asignar rol "${role}" a ${user.full_name}?`
    )) return;

    setBusy(`${user.id}:${role}`);
    setFeedback(null);

    if (user.roles.includes(role)) {
      const res = await removeRole(user.id, role);
      if (!res.ok) {
        setFeedback({ kind: 'error', msg: res.error ?? 'Error al quitar rol' });
      } else {
        setFeedback({ kind: 'ok', msg: `Rol "${role}" quitado a ${user.full_name}` });
      }
    } else {
      const ok = await assignRole(user.id, role);
      if (!ok) {
        setFeedback({ kind: 'error', msg: 'Error al asignar rol' });
      } else {
        setFeedback({ kind: 'ok', msg: `Rol "${role}" asignado a ${user.full_name}` });
      }
    }

    setBusy(null);
    await reload();
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!selTeacher || !selStudent) {
      setFeedback({ kind: 'error', msg: 'Elige teacher y estudiante' });
      return;
    }
    setBusy('assign-ts');
    setFeedback(null);
    const res = await assignStudentToTeacher(selTeacher, selStudent, cohort.trim() || null);
    if (!res.ok) {
      setFeedback({ kind: 'error', msg: res.error ?? 'Error al asignar' });
    } else {
      setFeedback({ kind: 'ok', msg: 'Estudiante asignado' });
      setSelStudent('');
      setCohort('');
    }
    setBusy(null);
    await reload();
  }

  async function handleUnassign(ts: TeacherStudent) {
    if (!ts.teacher_id) return;
    if (!confirm(`¿Desasignar a ${ts.full_name} de ${ts.teacher_name ?? 'su teacher'}?`)) return;
    setBusy(`unassign:${ts.id}`);
    const ok = await unassignStudentFromTeacher(ts.teacher_id, ts.id);
    if (!ok) setFeedback({ kind: 'error', msg: 'Error al desasignar' });
    else setFeedback({ kind: 'ok', msg: 'Estudiante desasignado' });
    setBusy(null);
    await reload();
  }

  // --- Render ---
  if (authorized === null) {
    return <div className="admin-loading">Verificando permisos…</div>;
  }
  if (authorized === false) {
    return (
      <div className="admin-denied">
        <h2>Acceso restringido</h2>
        <p>Esta sección es solo para administradores.</p>
        <button onClick={() => navigate('/')}>Volver a la galería</button>
      </div>
    );
  }

  return (
    <main className="admin-main">
      <header className="admin-header">
        <h1>Panel de administración</h1>
        <p className="admin-subtitle">
          Gestión de roles multi-rol y asignación profesor↔estudiante.
        </p>
      </header>

      {feedback && (
        <div className={`admin-feedback admin-feedback--${feedback.kind}`}>
          {feedback.msg}
          <button className="admin-feedback-close" onClick={() => setFeedback(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Cargando…</div>
      ) : (
        <>
          {/* Sección 1: Usuarios y roles */}
          <section className="admin-section">
            <h2 className="admin-section-title">Usuarios &amp; roles ({users.length})</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Roles</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td className="admin-td-email">{u.email}</td>
                      <td>
                        <div className="admin-chip-row">
                          {u.roles.length === 0
                            ? <span className="admin-chip admin-chip--empty">sin rol</span>
                            : u.roles.map((r) => (
                                <span key={r} className={`admin-chip admin-chip--${r}`}>{r}</span>
                              ))}
                        </div>
                      </td>
                      <td>
                        <div className="admin-action-row">
                          {ALL_ROLES.map((r) => {
                            const has = u.roles.includes(r);
                            const thisBusy = busy === `${u.id}:${r}`;
                            return (
                              <button
                                key={r}
                                className={`admin-role-btn ${has ? 'admin-role-btn--on' : ''}`}
                                onClick={() => handleToggleRole(u, r)}
                                disabled={thisBusy || busy !== null}
                                title={has ? `Quitar rol ${r}` : `Asignar rol ${r}`}
                              >
                                {has ? '−' : '+'} {r}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sección 2: Teacher ↔ Student */}
          <section className="admin-section">
            <h2 className="admin-section-title">Asignación profesor ↔ estudiante</h2>

            <form className="admin-assign-form" onSubmit={handleAssignStudent}>
              <label>
                Teacher
                <select
                  value={selTeacher}
                  onChange={(e) => setSelTeacher(e.target.value)}
                  disabled={busy !== null}
                >
                  <option value="">— elegir —</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </label>
              <label>
                Estudiante
                <select
                  value={selStudent}
                  onChange={(e) => setSelStudent(e.target.value)}
                  disabled={busy !== null}
                >
                  <option value="">— elegir —</option>
                  {studentUsers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </label>
              <label>
                Cohort (opcional)
                <input
                  type="text"
                  value={cohort}
                  onChange={(e) => setCohort(e.target.value)}
                  placeholder="ej. 2026-1"
                  disabled={busy !== null}
                />
              </label>
              <button
                type="submit"
                className="admin-primary-btn"
                disabled={busy !== null || !selTeacher || !selStudent}
              >
                Asignar
              </button>
            </form>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Email</th>
                    <th>Teacher asignado</th>
                    <th>Cohort</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr><td colSpan={5} className="admin-empty">Sin estudiantes.</td></tr>
                  )}
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.full_name}</td>
                      <td className="admin-td-email">{s.email}</td>
                      <td>
                        {s.teacher_id
                          ? <span>{s.teacher_name ?? s.teacher_id}</span>
                          : <span className="admin-chip admin-chip--empty">sin teacher</span>}
                      </td>
                      <td>{s.cohort ?? '—'}</td>
                      <td>
                        {s.teacher_id ? (
                          <button
                            className="admin-role-btn"
                            onClick={() => handleUnassign(s)}
                            disabled={busy !== null}
                          >
                            Desasignar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
