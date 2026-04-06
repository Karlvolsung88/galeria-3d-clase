import { useState } from 'react';
import HexagonChart from './HexagonChart';
import type { StudentWithSkills } from '../lib/supabase';

interface Props {
  student: StudentWithSkills;
}

const categoryColors: Record<string, string> = {
  personaje: '#ff4d00',
  vehiculo: '#00e5ff',
  criatura: '#a855f7',
  objeto: '#22c55e',
};

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0].slice(0, 2);
  return (
    <div className="student-avatar">
      {initials.toUpperCase()}
    </div>
  );
}

export default function StudentCard({ student }: Props) {
  const [thumbError, setThumbError] = useState<Record<string, boolean>>({});
  const hasSkills = student.student_skills.length > 0;
  const models = student.models.slice(0, 3);

  return (
    <article className="student-card">
      {/* Header */}
      <div className="student-card-header">
        <Initials name={student.full_name} />
        <div className="student-card-info">
          <h3 className="student-name">{student.full_name}</h3>
          <span className="student-role-badge">Estudiante</span>
        </div>
      </div>

      {/* Radar chart */}
      <div className="student-chart-wrap">
        <HexagonChart skills={student.student_skills} size={220} />
        {!hasSkills && (
          <p className="student-chart-empty">Sin habilidades registradas</p>
        )}
      </div>

      {/* Modelos del estudiante */}
      {models.length > 0 && (
        <div className="student-models">
          <p className="student-models-label">Modelos</p>
          <div className="student-models-grid">
            {models.map((m) => (
              <div
                key={m.id}
                className="student-model-thumb"
                title={m.title}
                style={{ borderColor: categoryColors[m.category] || '#333' }}
              >
                {!thumbError[m.id] ? (
                  /* @ts-ignore */
                  <model-viewer
                    src={m.file_url}
                    loading="lazy"
                    reveal="auto"
                    auto-rotate
                    interaction-prompt="none"
                    shadow-intensity="0"
                    environment-image="neutral"
                    exposure="1.1"
                    camera-orbit="45deg 65deg auto"
                    disable-zoom
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: 'transparent',
                      '--poster-color': 'transparent',
                      pointerEvents: 'none',
                    } as React.CSSProperties}
                    onError={() => setThumbError((p) => ({ ...p, [m.id]: true }))}
                  />
                ) : (
                  <div className="student-model-thumb-fallback">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                  </div>
                )}
                <div className="student-model-thumb-title">{m.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {models.length === 0 && (
        <p className="student-no-models">Sin modelos publicados</p>
      )}
    </article>
  );
}
