import { useState, useEffect } from 'react';
import { supabase, getUserProfile, updateProfile, type Profile } from '../lib/supabase';

const BIO_MAX = 150;

type Mode = 'view' | 'edit';
type SaveState = 'idle' | 'saving' | 'ok' | 'error';

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('view');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [artstation, setArtstation] = useState('');
  const [instagram, setInstagram] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1') setMode('edit');
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/galeria-3d-clase/';
        return;
      }
      const p = await getUserProfile();
      setProfile(p);
      if (p) {
        setFullName(p.full_name ?? '');
        setBio(p.bio ?? '');
        setArtstation(p.artstation_url ?? '');
        setInstagram(p.instagram_url ?? '');
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleEdit = () => {
    setSaveState('idle');
    setMode('edit');
  };

  const handleCancel = () => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setBio(profile.bio ?? '');
      setArtstation(profile.artstation_url ?? '');
      setInstagram(profile.instagram_url ?? '');
    }
    setSaveState('idle');
    setMode('view');
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaveState('saving');
    const ok = await updateProfile(profile.id, {
      full_name: fullName.trim() || profile.full_name,
      bio: bio.trim() || null,
      artstation_url: artstation.trim() || null,
      instagram_url: instagram.trim() || null,
    });
    if (ok) {
      setProfile({ ...profile, full_name: fullName, bio, artstation_url: artstation, instagram_url: instagram });
      setSaveState('ok');
      setTimeout(() => { setSaveState('idle'); setMode('view'); }, 900);
    } else {
      setSaveState('error');
    }
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <span className="estudiantes-loading-dot" />
        <span className="estudiantes-loading-dot" />
        <span className="estudiantes-loading-dot" />
      </div>
    );
  }

  if (!profile) return null;

  const initials = (() => {
    const parts = profile.full_name.trim().split(' ');
    return parts.length >= 2
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  })();

  return (
    <div className="profile-wrap">
      {/* Avatar + nombre */}
      <div className="profile-hero">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-hero-info">
          <h1 className="profile-hero-name">{profile.full_name}</h1>
          <span className="profile-hero-role">
            {profile.role === 'admin' ? 'Administrador' : 'Estudiante'}
          </span>
        </div>
        {mode === 'view' && (
          <button className="profile-edit-trigger" onClick={handleEdit}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar Perfil
          </button>
        )}
      </div>

      {mode === 'view' ? (
        /* ── VISTA ── */
        <div className="profile-view">
          {profile.bio && (
            <div className="profile-section">
              <span className="profile-section-label">Bio</span>
              <p className="profile-bio-text">{profile.bio}</p>
            </div>
          )}
          <div className="profile-links-row">
            {profile.artstation_url ? (
              <a href={profile.artstation_url} target="_blank" rel="noopener noreferrer"
                className="student-bio-link student-bio-link--artstation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 0 0 2.164 1.333h13.457l-2.792-4.838H0zm24 .025c0-.484-.143-.935-.388-1.314L15.728 2.728A2.424 2.424 0 0 0 13.564 1.4H9.419L21.598 22.54l1.92-3.325A2.987 2.987 0 0 0 24 17.748zm-11.26-3.862L7.547 2.973 2.55 11.886h10.19z"/>
                </svg>
                ArtStation
              </a>
            ) : <span className="student-bio-link--empty">Sin ArtStation</span>}
            {profile.instagram_url ? (
              <a href={profile.instagram_url} target="_blank" rel="noopener noreferrer"
                className="student-bio-link student-bio-link--instagram">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <circle cx="12" cy="12" r="4"/>
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" strokeWidth="0"/>
                </svg>
                Instagram
              </a>
            ) : <span className="student-bio-link--empty">Sin Instagram</span>}
          </div>
        </div>
      ) : (
        /* ── EDICIÓN ── */
        <div className="profile-form">
          <div className="profile-field">
            <label className="profile-label" htmlFor="pf-name">Nombre completo</label>
            <input
              id="pf-name"
              className="profile-input"
              type="text"
              value={fullName}
              maxLength={80}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="pf-bio">
              Bio
              <span className={`profile-bio-count ${bio.length >= BIO_MAX ? 'profile-bio-count--limit' : ''}`}>
                {bio.length}/{BIO_MAX}
              </span>
            </label>
            <textarea
              id="pf-bio"
              className="profile-textarea"
              value={bio}
              maxLength={BIO_MAX}
              rows={3}
              placeholder="Cuéntanos sobre ti en máximo 150 caracteres…"
              onChange={(e) => setBio(e.target.value)}
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="pf-artstation">ArtStation</label>
            <input
              id="pf-artstation"
              className="profile-input"
              type="url"
              placeholder="https://www.artstation.com/usuario"
              value={artstation}
              onChange={(e) => setArtstation(e.target.value)}
            />
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="pf-instagram">Instagram</label>
            <input
              id="pf-instagram"
              className="profile-input"
              type="url"
              placeholder="https://www.instagram.com/usuario"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
            />
          </div>

          <div className="profile-form-actions">
            <button className="profile-cancel-btn" onClick={handleCancel}>Cancelar</button>
            <button
              className={`profile-save-btn ${saveState}`}
              onClick={handleSave}
              disabled={saveState === 'saving' || !fullName.trim()}
            >
              {saveState === 'saving' && 'Guardando…'}
              {saveState === 'ok' && '✓ Guardado'}
              {saveState === 'error' && '✗ Error — reintentar'}
              {saveState === 'idle' && 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
