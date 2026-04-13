import { useState } from 'react';
import HexagonChart from './HexagonChart';
import { updateStudentLinks, deleteStudentSkills, deleteStudentProfile, type StudentWithSkills } from '../lib/api';

interface Props {
  student: StudentWithSkills;
  currentUserId?: string;
  isAdmin?: boolean;
  onDeleted?: () => void;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0].slice(0, 2);
  return <div className="student-avatar">{initials.toUpperCase()}</div>;
}

type LinkSaveState = 'idle' | 'saving' | 'ok' | 'error';

export default function StudentCard({ student, currentUserId, isAdmin, onDeleted }: Props) {
  const hasSkills = student.student_skills.length > 0;
  const isOwn = currentUserId === student.id;
  const [confirmDelete, setConfirmDelete] = useState<'skills' | 'profile' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editing, setEditing] = useState(false);
  const [artstation, setArtstation] = useState(student.artstation_url ?? '');
  const [instagram, setInstagram] = useState(student.instagram_url ?? '');
  const [linkState, setLinkState] = useState<LinkSaveState>('idle');

  async function handleSaveLinks() {
    setLinkState('saving');
    const ok = await updateStudentLinks(student.id, artstation || null, instagram || null);
    setLinkState(ok ? 'ok' : 'error');
    if (ok) {
      setTimeout(() => { setEditing(false); setLinkState('idle'); }, 800);
    }
  }

  return (
    <div className="student-card-wrap">
      {/* Tarjeta principal — gráfico */}
      <article className="student-card">
        <div className="student-card-header">
          <Initials name={student.full_name} />
          <div className="student-card-info">
            <h3 className="student-name">{student.full_name}</h3>
            <span className="student-role-badge">Estudiante</span>
          </div>
        </div>

        <div className="student-chart-wrap">
          <HexagonChart skills={student.student_skills} />
          {!hasSkills && (
            <p className="student-chart-empty">Sin habilidades registradas</p>
          )}
        </div>
      </article>

      {/* Bio card — links */}
      <div className="student-bio-card">
        {!editing ? (
          <>
            <div className="student-bio-links">
              {artstation ? (
                <a href={artstation} target="_blank" rel="noopener noreferrer"
                  className="student-bio-link student-bio-link--artstation">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 0 0 2.164 1.333h13.457l-2.792-4.838H0zm24 .025c0-.484-.143-.935-.388-1.314L15.728 2.728A2.424 2.424 0 0 0 13.564 1.4H9.419L21.598 22.54l1.92-3.325A2.987 2.987 0 0 0 24 17.748zm-11.26-3.862L7.547 2.973 2.55 11.886h10.19z"/>
                  </svg>
                  ArtStation
                </a>
              ) : (
                <span className="student-bio-link--empty">Sin ArtStation</span>
              )}
              {instagram ? (
                <a href={instagram} target="_blank" rel="noopener noreferrer"
                  className="student-bio-link student-bio-link--instagram">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" strokeWidth="0"/>
                  </svg>
                  Instagram
                </a>
              ) : (
                <span className="student-bio-link--empty">Sin Instagram</span>
              )}
            </div>
            {isOwn && (
              <button className="student-bio-edit-btn" onClick={() => setEditing(true)} title="Editar mis links">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
          </>
        ) : (
          <div className="student-bio-edit-form">
            <input
              className="student-bio-input"
              type="url"
              placeholder="ArtStation URL"
              value={artstation}
              onChange={(e) => setArtstation(e.target.value)}
            />
            <input
              className="student-bio-input"
              type="url"
              placeholder="Instagram URL"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
            />
            <div className="student-bio-edit-actions">
              <button className="student-bio-cancel-btn" onClick={() => { setEditing(false); setLinkState('idle'); }}>
                Cancelar
              </button>
              <button
                className={`student-bio-save-btn ${linkState}`}
                onClick={handleSaveLinks}
                disabled={linkState === 'saving'}
              >
                {linkState === 'saving' ? 'Guardando…' : linkState === 'ok' ? '✓ Listo' : linkState === 'error' ? '✗ Error' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="student-admin-actions">
          {hasSkills && (
            <button
              className="student-admin-btn student-admin-btn--clear"
              onClick={() => setConfirmDelete('skills')}
              title="Limpiar skills"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
              </svg>
              Limpiar skills
            </button>
          )}
          <button
            className="student-admin-btn student-admin-btn--delete"
            onClick={() => setConfirmDelete('profile')}
            title="Eliminar estudiante"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            Eliminar estudiante
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="upload-modal" style={{ maxWidth: '440px' }}>
            <div className="upload-header">
              <h2 className="upload-title">
                {confirmDelete === 'skills' ? 'Limpiar Skills' : 'Eliminar Estudiante'}
              </h2>
            </div>
            <div className="upload-body">
              <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6' }}>
                {confirmDelete === 'skills'
                  ? <>¿Limpiar las habilidades de <strong style={{ color: 'var(--text)' }}>{student.full_name}</strong>? El gráfico se vaciará.</>
                  : <>¿Eliminar a <strong style={{ color: 'var(--text)' }}>{student.full_name}</strong> completamente? Se borrarán sus skills, likes y comentarios. Esta acción no se puede deshacer.</>
                }
              </p>
              <div className="upload-actions">
                <button className="upload-cancel" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancelar</button>
                <button
                  className="upload-submit"
                  style={{ background: '#ff4d00', borderColor: '#ff4d00' }}
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    const ok = confirmDelete === 'skills'
                      ? await deleteStudentSkills(student.id)
                      : await deleteStudentProfile(student.id);
                    setDeleting(false);
                    if (ok) {
                      setConfirmDelete(null);
                      onDeleted?.();
                    }
                  }}
                >
                  {deleting ? 'Procesando...' : confirmDelete === 'skills' ? 'Limpiar' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
