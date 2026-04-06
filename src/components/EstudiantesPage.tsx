import { useState, useEffect } from 'react';
import {
  supabase,
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

    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (session) {
        const p = await getUserProfile();
        if (isMounted) setProfile(p);
      } else {
        setProfile(null);
      }
    };

    const loadData = async () => {
      try {
        const data = await fetchAllStudentsWithSkills();
        if (isMounted) setStudents(data);
      } catch (err) {
        console.error('Error loading students:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // CRÍTICO: registrar listener antes de loadData — completa la
    // inicialización de auth en Supabase v2 y evita que la query
    // quede encolada durante el token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadProfile();
    });

    loadProfile();
    loadData();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
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
            <StudentCard key={student.id} student={student} currentUserId={profile?.id} />
          ))}
        </div>
      )}
    </>
  );
}
