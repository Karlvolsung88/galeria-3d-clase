import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadShowcase } from '../lib/api';

/**
 * Form de subida de Showcase Marmoset (v3.3.0).
 * Solo admin/teacher (validación cliente + servidor con requireRole).
 *
 * Recibe un modelo existente del estudiante y le agrega su versión .mview
 * (procesada por el docente en Marmoset Toolbag con materiales PBR avanzados).
 *
 * PROTOTIPO LOCAL: durante la fase de prototipado, el submit final está
 * detrás del flag PROTOTYPE_GUARD. Cuando esté en true (prototipado),
 * el form valida todo pero NO hace el upload real al backend — solo loguea
 * en consola. Eso evita contaminar el bucket de prod accidentalmente.
 *
 * Para activar uploads reales: cambiar PROTOTYPE_GUARD a false. Esto se hará
 * en Sprint 7 (deploy) una vez todo el flujo esté validado.
 */
const PROTOTYPE_GUARD = true;

interface ShowcaseUploadFormProps {
  modelId: string;
  modelTitle: string;
  studentName: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function ShowcaseUploadForm({
  modelId,
  modelTitle,
  studentName,
  onSuccess,
  onClose,
}: ShowcaseUploadFormProps) {
  const [mviewFile, setMviewFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const mviewInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    },
    [onClose, loading]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    };
  }, [handleKeyDown, thumbPreview]);

  const handleMviewChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.mview')) {
      setError('Solo se aceptan archivos .mview de Marmoset Toolbag');
      return;
    }
    setMviewFile(file);
    setError('');
  };

  const handleThumbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('La portada debe ser una imagen (PNG / JPG / WEBP)');
      return;
    }
    setThumbFile(file);
    setError('');
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mviewFile || !thumbFile) return;

    if (PROTOTYPE_GUARD) {
      // Modo prototipo: NO subimos al backend. Solo log para QA visual.
      console.group('[PROTOTYPE_GUARD] Upload Showcase simulado');
      console.log('Modelo destino:', { modelId, modelTitle, studentName });
      console.log('Archivo .mview:', { name: mviewFile.name, size: mviewFile.size });
      if (thumbFile) console.log('Imagen portada (opcional):', { name: thumbFile.name, size: thumbFile.size, type: thumbFile.type });
      console.groupEnd();
      alert(
        `🔒 PROTOTIPO LOCAL — subida desactivada.\n\n` +
        `Validación OK:\n` +
        `  • Modelo: ${modelTitle}\n` +
        `  • Estudiante: ${studentName}\n` +
        `  • .mview: ${mviewFile.name} (${(mviewFile.size / 1024 / 1024).toFixed(2)} MB)\n` +
        `  • Portada: ${thumbFile ? thumbFile.name : '(sin portada — usará la del .mview o fallback)'}\n\n` +
        `El upload real al bucket de Spaces se activará en Sprint 7 (deploy).`
      );
      onClose();
      return;
    }

    // Path real (se activa quitando el guard)
    setLoading(true);
    setError('');
    try {
      setProgress('Subiendo Showcase...');
      await uploadShowcase(modelId, mviewFile, thumbFile ?? undefined);
      setProgress('');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al subir Showcase');
      setLoading(false);
      setProgress('');
    }
  };

  // Solo el .mview es obligatorio. La portada es opcional — el viewer puede
  // usar el thumbnail embebido del .mview o caer al thumbnail del .glb.
  const isValid = !!mviewFile;

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="upload-modal">
        <div className="upload-header">
          <h2 className="upload-title">⭐ Agregar Showcase Marmoset</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={loading}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="upload-body">
          <div className="showcase-form-context">
            <span className="showcase-form-label">Modelo destino</span>
            <span className="showcase-form-value">
              <strong>{modelTitle}</strong> — {studentName}
            </span>
          </div>

          {/* Archivo .mview */}
          <div
            className={`upload-dropzone ${mviewFile ? 'has-file' : ''}`}
            onClick={() => !loading && mviewInputRef.current?.click()}
            style={{ minHeight: 140 }}
          >
            {mviewFile ? (
              <div className="upload-dropzone-content">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="1.5">
                  <path d="M3 20 L3 6 L8 14 L13 6 L13 20" />
                  <path d="M16 8 L20 8 L20 12 L16 12 Z" />
                </svg>
                <span style={{ marginTop: 8, color: '#00e5ff' }}>{mviewFile.name}</span>
                <span style={{ fontSize: 11, color: '#8b95a8', marginTop: 4 }}>
                  {(mviewFile.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            ) : (
              <div className="upload-dropzone-content">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Click para seleccionar archivo .mview</span>
                <span style={{ fontSize: 11, color: '#8b95a8', marginTop: 6 }}>
                  Exportado desde Marmoset Toolbag (Export → Viewer)
                </span>
              </div>
            )}
            <input
              ref={mviewInputRef}
              type="file"
              accept=".mview"
              onChange={handleMviewChange}
              style={{ display: 'none' }}
              disabled={loading}
            />
          </div>

          {/* Imagen de portada (opcional) */}
          <div className="upload-fields">
            <div className="upload-field">
              <label>Imagen de portada (.png / .jpg) <span style={{color:'var(--muted)',fontWeight:400}}>— opcional</span></label>
              <div
                className={`upload-thumb-picker ${thumbFile ? 'has-thumb' : ''}`}
                onClick={() => !loading && thumbInputRef.current?.click()}
              >
                {thumbPreview ? (
                  <img src={thumbPreview} alt="Preview portada" />
                ) : (
                  <div className="upload-thumb-placeholder">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <span>Click para subir portada</span>
                  </div>
                )}
                <input
                  ref={thumbInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleThumbChange}
                  style={{ display: 'none' }}
                  disabled={loading}
                />
              </div>
              {thumbFile && (
                <span style={{ fontSize: 11, color: '#8b95a8', marginTop: 4 }}>
                  {thumbFile.name} · {(thumbFile.size / 1024).toFixed(0)} KB
                </span>
              )}
            </div>
          </div>

          {error && (
            <p style={{ color: '#ff4d00', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' }}>
              {error}
            </p>
          )}

          {progress && (
            <p style={{ color: '#00e5ff', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
              {progress}
            </p>
          )}

          {PROTOTYPE_GUARD && (
            <p style={{
              color: '#c4a97d',
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              borderLeft: '2px solid #c4a97d',
              paddingLeft: 10,
              marginTop: 8,
            }}>
              🔒 Modo prototipo: el submit valida los archivos pero no los sube.
              Activación real en Sprint 7.
            </p>
          )}

          <div className="upload-actions">
            <button type="button" className="upload-cancel" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="upload-submit" disabled={!isValid || loading}>
              {loading ? 'Subiendo...' : 'Agregar Showcase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
