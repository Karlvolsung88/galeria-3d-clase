import { useState, useEffect } from 'react';
import {
  initAuth, onAuthStateChange, getMe,
  fetchAllStudentsWithSkills,
  type Profile,
  type StudentWithSkills,
} from '../lib/api';
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
      const { user, profile: p } = await initAuth();
      if (!isMounted) return;

      if (user && p) setProfile(p);

      try {
        const data = await fetchAllStudentsWithSkills();
        if (isMounted) setStudents(data);
      } catch (err) {
        console.error('Error loading students:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const unsub = onAuthStateChange(async (user) => {
      if (!isMounted) return;
      if (user) {
        const p = await getMe();
        if (isMounted) setProfile(p);
      } else {
        if (isMounted) setProfile(null);
      }
    });

    init();

    return () => { isMounted = false; unsub(); };
  }, []);

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
