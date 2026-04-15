import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  initAuth,
  getTeacherStudents,
  isTeacher,
  isAdmin,
  type TeacherStudent,
  type Profile,
} from '../lib/api';

/**
 * Panel Teacher — vista read-only para profesores.
 * Muestra la lista de SUS estudiantes asignados (viene filtrado desde el backend).
 * Si el usuario es admin, ve a todos los estudiantes (con el teacher de cada uno).
 * El endpoint `/api/teacher/students` aplica el filtrado por rol en backend.
 */
export default function TeacherPanel() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { user, profile: p } = await initAuth();
      if (!user) {
        navigate('/', { replace: true });
        return;
      }
      if (!isTeacher(user) && !isAdmin(user)) {
        setAuthorized(false);
        return;
      }
      setAuthorized(true);
      setProfile(p);
      try {
        const list = await getTeacherStudents();
        setStudents(list);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authorized === null) {
    return <div className="admin-loading">Verificando permisos…</div>;
  }
  if (authorized === false) {
    return (
      <div className="admin-denied">
        <h2>Acceso restringido</h2>
        <p>Esta sección es solo para profesores y administradores.</p>
        <button onClick={() => navigate('/')}>Volver a la galería</button>
      </div>
    );
  }

  const showTeacherColumn = profile ? isAdmin(profile) : false;

  return (
    <main className="admin-main">
      <header className="admin-header">
        <h1>Mis estudiantes</h1>
        <p className="admin-subtitle">
          {showTeacherColumn
            ? 'Vista de admin: todos los estudiantes con su profesor asignado.'
            : 'Estudiantes a tu cargo. Puedes gestionar sus modelos, skills y perfil desde la galería.'}
        </p>
      </header>

      {error && (
        <div className="admin-feedback admin-feedback--error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Cargando…</div>
      ) : (
        <section className="admin-section">
          <h2 className="admin-section-title">
            {showTeacherColumn ? `Estudiantes (${students.length})` : `Tus estudiantes (${students.length})`}
          </h2>

          {students.length === 0 ? (
            <p className="admin-empty">
              {showTeacherColumn
                ? 'No hay estudiantes registrados todavía.'
                : 'Aún no tienes estudiantes asignados. Pide al administrador que te asigne desde el Panel Admin.'}
            </p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Email</th>
                    {showTeacherColumn && <th>Profesor</th>}
                    <th>Cohort</th>
                    <th>Asignado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.full_name}</td>
                      <td className="admin-td-email">{s.email || '—'}</td>
                      {showTeacherColumn && (
                        <td>
                          {s.teacher_id
                            ? <span>{s.teacher_name ?? 'sin nombre'}</span>
                            : <span className="admin-chip admin-chip--empty">sin profesor</span>}
                        </td>
                      )}
                      <td>{s.cohort ?? '—'}</td>
                      <td className="admin-td-email">
                        {s.assigned_at
                          ? new Date(s.assigned_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })
                          : '—'}
                      </td>
                      <td>
                        <Link to={`/estudiantes?focus=${s.id}`} className="admin-role-btn">
                          Ver perfil
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
