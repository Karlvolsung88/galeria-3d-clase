import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import ModelScene from './ModelScene';
import ThumbnailCapture from './ThumbnailCapture';
import { createModel } from '../lib/api';

interface UploadFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const categoryOptions = [
  { value: 'objeto', label: 'Objeto' },
  { value: 'personaje', label: 'Personaje' },
  { value: 'criatura', label: 'Criatura' },
  { value: 'vehiculo', label: 'Vehículo' },
];

export default function UploadForm({ onSuccess, onClose }: UploadFormProps) {
  const [title, setTitle] = useState('');
  const [student, setStudent] = useState('');
  const [category, setCategory] = useState('objeto');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailBlobRef = useRef<Blob | null>(null);

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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [handleKeyDown, previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.name.endsWith('.glb') && !selected.name.endsWith('.gltf')) {
      setError('Solo se aceptan archivos .glb o .gltf');
      return;
    }
    setFile(selected);
    setError('');
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
    if (!title) {
      setTitle(selected.name.replace(/\.(glb|gltf)$/, '').replace(/[-_]/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !student) return;

    setLoading(true);
    setError('');

    try {
      setProgress('Subiendo archivo...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      formData.append('student', student);
      formData.append('category', category);
      formData.append('description', description || `Modelo 3D creado por ${student}`);

      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      formData.append('tags', JSON.stringify(tags.length > 0 ? tags : ['GLB', 'Blender']));

      if (thumbnailBlobRef.current) {
        formData.append('thumbnail', thumbnailBlobRef.current, 'thumb.webp');
      }

      setProgress('Guardando...');
      await createModel(formData);

      setProgress('');
      onSuccess();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      setProgress('');
    }
  };

  const isValid = file && title && student;

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="upload-modal">
        <div className="upload-header">
          <h2 className="upload-title">Subir Modelo 3D</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={loading}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="upload-body">
          <div
            className={`upload-dropzone ${file ? 'has-file' : ''}`}
            onClick={() => !loading && fileInputRef.current?.click()}
          >
            {previewUrl ? (
              <>
                <Canvas camera={{ position: [3, 2, 3], fov: 40 }} gl={{ antialias: true, preserveDrawingBuffer: true }} style={{ width: '100%', height: '100%' }}>
                  <ModelScene
                    url={previewUrl}
                    autoRotate={true}
                    enableZoom={true}
                    enablePan={false}
                    enableRotate={true}
                    showFloor={true}
                  />
                  <ThumbnailCapture onCapture={(blob) => { thumbnailBlobRef.current = blob; }} />
                </Canvas>
                <div className="upload-file-name">
                  {file?.name} ({((file?.size || 0) / 1024 / 1024).toFixed(1)} MB)
                </div>
              </>
            ) : (
              <div className="upload-dropzone-content">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Click para seleccionar archivo .glb</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={loading}
            />
          </div>

          <div className="upload-fields">
            <div className="upload-field">
              <label>Título del modelo *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Espada Vikinga"
                disabled={loading}
              />
            </div>

            <div className="upload-field">
              <label>Nombre del estudiante *</label>
              <input
                type="text"
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                placeholder="Ej: Juan Pérez"
                disabled={loading}
              />
            </div>

            <div className="upload-field">
              <label>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={loading}>
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="upload-field">
              <label>Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción del modelo..."
                rows={2}
                disabled={loading}
              />
            </div>

            <div className="upload-field">
              <label>Tags (separados por coma)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="PBR, Hard Surface, Blender"
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <p style={{ color: '#ff4d00', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace' }}>
              {error}
            </p>
          )}

          {progress && (
            <p style={{ color: '#00e5ff', fontSize: '12px', fontFamily: 'JetBrains Mono, monospace' }}>
              {progress}
            </p>
          )}

          <div className="upload-actions">
            <button type="button" className="upload-cancel" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="upload-submit" disabled={!isValid || loading}>
              {loading ? 'Subiendo...' : 'Subir a la galería'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
