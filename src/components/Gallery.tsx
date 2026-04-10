import { useState, useMemo, useRef, useEffect } from 'react';
import { supabase, getUserProfile, fetchLikeCounts, fetchCommentCounts, fetchUserLikes, toggleLike } from '../lib/supabase';
import type { ModelRow, Profile } from '../lib/supabase';
import ModelCard from './ModelCard';
import ModelModal from './ModelModal';
import UploadForm from './UploadForm';
import EditModelForm from './EditModelForm';
import AuthModal from './AuthModal';

const categories = [
  { key: 'all', label: 'Todos' },
  { key: 'personaje', label: 'Personaje' },
  { key: 'vehiculo', label: 'Vehículo' },
  { key: 'criatura', label: 'Criatura' },
  { key: 'objeto', label: 'Objeto' },
];

export default function Gallery() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedModel, setSelectedModel] = useState<ModelRow | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelRow | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ModelRow | null>(null);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const modalCounter = useRef(0);

  const isLoggedIn = !!userId;
  const isAdmin = profile?.role === 'admin';

  // Función reutilizable para cargar modelos, likes y comments
  const loadModels = async () => {
    setLoading(true);
    try {
      const [modelsRes, counts, commentCountsData] = await Promise.all([
        supabase.from('models').select('*').order('created_at', { ascending: false }),
        fetchLikeCounts(),
        fetchCommentCounts(),
      ]);
      if (!modelsRes.error && modelsRes.data) setModels(modelsRes.data);
      setLikeCounts(counts);
      setCommentCounts(commentCountsData);
    } catch (err) {
      console.error('Error loading models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      // Esperar que el token refresh de Supabase v2 complete antes
      // de lanzar cualquier query — sin esto las queries quedan en
      // cola indefinidamente cuando hay sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      if (session) {
        setUserId(session.user.id);
        const [p, likes] = await Promise.all([
          getUserProfile(),
          fetchUserLikes(session.user.id),
        ]);
        if (isMounted) { setProfile(p); setUserLikes(likes); }
      }

      // Auth resuelto — ahora las queries se ejecutan
      await loadModels();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!isMounted) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session) {
          setUserId(session.user.id);
          getUserProfile().then(p => { if (isMounted) setProfile(p); });
          fetchUserLikes(session.user.id).then(l => { if (isMounted) setUserLikes(l); });
        } else {
          setUserId(null); setProfile(null); setUserLikes(new Set());
        }
      });
    });

    init();

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, []);

  // Can this user edit/delete a given model?
  const canEdit = (model: ModelRow): boolean => {
    if (!userId) return false;
    if (isAdmin) return true;
    return model.user_id === userId;
  };

  const filteredModels = useMemo(() => {
    if (activeFilter === 'all') return models;
    return models.filter((m) => m.category === activeFilter);
  }, [models, activeFilter]);

  const handleOpenModal = (model: ModelRow) => {
    modalCounter.current += 1;
    setSelectedModel(model);
  };

  const handleToggleLike = (modelId: string) => {
    if (!userId) { setShowAuth(true); return; }

    const currentlyLiked = userLikes.has(modelId);

    // Optimistic update
    setUserLikes((prev) => {
      const next = new Set(prev);
      if (currentlyLiked) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
    setLikeCounts((prev) => ({
      ...prev,
      [modelId]: (prev[modelId] || 0) + (currentlyLiked ? -1 : 1),
    }));

    toggleLike(modelId, userId, currentlyLiked).catch(() => {
      // Revert on error
      setUserLikes((prev) => {
        const next = new Set(prev);
        if (currentlyLiked) next.add(modelId);
        else next.delete(modelId);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [modelId]: (prev[modelId] || 0) + (currentlyLiked ? 1 : -1),
      }));
    });
  };

  const handleDelete = async (model: ModelRow) => {
    await supabase.storage.from('models').remove([model.file_name]);
    await supabase.from('models').delete().eq('id', model.id);
    setDeleteConfirm(null);
    loadModels();
  };

  return (
    <>
      {/* Filters + Auth controls */}
      <div className="filters">
        {categories.map((cat) => (
          <button
            key={cat.key}
            className={`filter-btn ${activeFilter === cat.key ? 'active' : ''}`}
            onClick={() => setActiveFilter(cat.key)}
          >
            {cat.label}
          </button>
        ))}

        <div className="filters-right">
          {isLoggedIn && (
            <button
              className="filter-btn upload-btn"
              onClick={() => setShowUpload(true)}
            >
              + Subir Modelo
            </button>
          )}
        </div>
      </div>

      {/* Counter */}
      <div style={{ padding: '16px 48px 0' }}>
        <span className="counter">
          {loading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}
        </span>
      </div>

      {/* Grid */}
      <div className="gallery-grid">
        {loading ? (
          <div className="gallery-loading">Cargando modelos...</div>
        ) : filteredModels.length === 0 ? (
          <div className="gallery-empty">
            {isLoggedIn
              ? 'No hay modelos. Usa "+ Subir Modelo" para agregar el primero.'
              : 'No hay modelos en esta categoría.'}
          </div>
        ) : (
          filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              title={model.title}
              student={model.student}
              category={model.category}
              tags={model.tags}
              modelUrl={model.file_url}
              canEdit={canEdit(model)}
              likeCount={likeCounts[model.id] || 0}
              commentCount={commentCounts[model.id] || 0}
              isLiked={userLikes.has(model.id)}
              onLike={() => handleToggleLike(model.id)}
              onClick={() => handleOpenModal(model)}
              onEdit={() => setEditingModel(model)}
              onDelete={() => setDeleteConfirm(model)}
            />
          ))
        )}
      </div>

      {/* Modal viewer */}
      {selectedModel && (
        <ModelModal
          key={`modal-${modalCounter.current}`}
          modelId={selectedModel.id}
          title={selectedModel.title}
          student={selectedModel.student}
          category={selectedModel.category}
          description={selectedModel.description}
          tags={selectedModel.tags}
          modelUrl={selectedModel.file_url}
          userId={userId}
          isAdmin={isAdmin}
          likeCount={likeCounts[selectedModel.id] || 0}
          isLiked={userLikes.has(selectedModel.id)}
          onLike={() => handleToggleLike(selectedModel.id)}
          onRequestAuth={() => setShowAuth(true)}
          onClose={() => setSelectedModel(null)}
        />
      )}

      {/* Upload form */}
      {showUpload && (
        <UploadForm
          onSuccess={() => { setShowUpload(false); loadModels(); }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Edit form */}
      {editingModel && (
        <EditModelForm
          key={editingModel.id}
          model={editingModel}
          onSave={() => { setEditingModel(null); loadModels(); }}
          onClose={() => setEditingModel(null)}
        />
      )}

      {/* Auth modal */}
      {showAuth && (
        <AuthModal
          onSuccess={() => setShowAuth(false)}
          onClose={() => setShowAuth(false)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          className="modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteConfirm(null);
          }}
        >
          <div className="upload-modal" style={{ maxWidth: '440px' }}>
            <div className="upload-header">
              <h2 className="upload-title">Eliminar Modelo</h2>
            </div>
            <div className="upload-body">
              <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.6' }}>
                ¿Estás seguro de que quieres eliminar{' '}
                <strong style={{ color: 'var(--text)' }}>{deleteConfirm.title}</strong>{' '}
                de {deleteConfirm.student}?
                <br />Esta acción no se puede deshacer.
              </p>
              <div className="upload-actions">
                <button className="upload-cancel" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </button>
                <button
                  className="upload-submit"
                  style={{ background: '#ff4d00', borderColor: '#ff4d00' }}
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
