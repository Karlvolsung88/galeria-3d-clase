import { useState, useEffect } from 'react';
import {
  supabase,
  getSessionSafe,
  getUserProfile,
  fetchAllStudentsWithSkills,
  type Profile,
  type StudentWithSkills,
} from '../lib/supabase';
import StudentCard from './StudentCard';
import SkillsEditor from './SkillsEditor';

export default function EstudiantesPage() {
  const [students, setStudents] = useState<StudentWithSkills[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Esperar que el token refresh de Supabase v2 complete antes
      // de lanzar cualquier query — sin esto las queries quedan en
      // cola indefinidamente cuando hay sesión activa
      const { data: { session } } = await getSessionSafe();
      if (!isMounted) return;

      if (session) {
        const p = await getUserProfile();
        if (isMounted) setProfile(p);
      }

      // Auth resuelto — ahora las queries se ejecutan
      try {
        const data = await fetchAllStudentsWithSkills();
        if (isMounted) setStudents(data);
      } catch (err) {
        console.error('Error loading students:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!isMounted) return;
      getSessionSafe().then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session) {
          getUserProfile().then(p => { if (isMounted) setProfile(p); });
        } else {
          if (isMounted) setProfile(null);
        }
      });
    });

    init();

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, []);

  // Re-fetch after admin saves skills so cards update
  const handleSaved = async () => {
    const data = await fetchAllStudentsWithSkills();
    setStudents(data);
  };

  if (loading) {
    return (
      <div className="estudiantes-loading">
        <span className="estudiantes-loading-dot" />
        <span className="estudiantes-loading-dot" />
        <span className="estudiantes-loading-dot" />
      </div>
    );
  }

  return (
    <>
      {isAdmin && students.length > 0 && (
        <SkillsEditor students={students} onSaved={handleSaved} />
      )}

      {students.length === 0 ? (
        <div className="estudiantes-empty">
          <p>No hay estudiantes registrados aún.</p>
        </div>
      ) : (
        <div className="estudiantes-grid">
          {students.map((student) => (
            <StudentCard key={student.id} student={student} currentUserId={profile?.id} isAdmin={isAdmin} onDeleted={handleSaved} />
          ))}
        </div>
      )}
    </>
  );
}
