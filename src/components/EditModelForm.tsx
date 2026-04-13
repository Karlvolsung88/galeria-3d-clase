import { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import ModelScene from './ModelScene';
import { updateModel, type ModelRow } from '../lib/api';

interface EditModelFormProps {
  model: ModelRow;
  onSave: () => void;
  onClose: () => void;
}

const categoryOptions = [
  { value: 'objeto', label: 'Objeto' },
  { value: 'personaje', label: 'Personaje' },
  { value: 'criatura', label: 'Criatura' },
  { value: 'vehiculo', label: 'Vehículo' },
];

export default function EditModelForm({ model, onSave, onClose }: EditModelFormProps) {
  const [title, setTitle] = useState(model.title);
  const [student, setStudent] = useState(model.student);
  const [category, setCategory] = useState(model.category);
  const [description, setDescription] = useState(model.description);
  const [tagsInput, setTagsInput] = useState(model.tags.join(', '));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !student) return;

    setLoading(true);
    setError('');

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      await updateModel(model.id, { title, student, category, description, tags });
      setLoading(false);
      onSave();
    } catch (err: any) {
      setLoading(false);
      setError('Error al guardar: ' + err.message);
    }
  };

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="upload-modal">
        <div className="upload-header">
          <h2 className="upload-title">Editar Modelo</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="upload-body">
          {/* Preview */}
          <div className="upload-dropzone has-file" style={{ cursor: 'default' }}>
            <Canvas camera={{ position: [3, 2, 3], fov: 40 }} gl={{ antialias: true }} style={{ width: '100%', height: '100%' }}>
              <ModelScene
                url={model.file_url}
                autoRotate={true}
                enableZoom={true}
                enablePan={false}
                enableRotate={true}
                showFloor={true}
              />
            </Canvas>
            <div className="upload-file-name">{model.file_name}</div>
          </div>

          <div className="upload-fields">
            <div className="upload-field">
              <label>Título del modelo *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="upload-field">
              <label>Nombre del estudiante *</label>
              <input
                type="text"
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                required
              />
            </div>

            <div className="upload-field">
              <label>Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
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
                rows={2}
              />
            </div>

            <div className="upload-field">
              <label>Tags (separados por coma)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p style={{ color: '#ff4d00', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace' }}>
              {error}
            </p>
          )}

          <div className="upload-actions">
            <button type="button" className="upload-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="upload-submit" disabled={loading || !title || !student}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
