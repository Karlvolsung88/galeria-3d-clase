import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import {
  initAuth, onAuthStateChange, getMe,
  fetchModels, fetchLikeCounts, fetchCommentCounts, fetchUserLikes, toggleLike,
  updateModelOrder, deleteModel,
  type ModelRow, type Profile,
} from '../lib/api';
import SortableModelCard from './SortableModelCard';
import ModelCard from './ModelCard';
import AuthModal from './AuthModal';

// Lazy: estos componentes cargan Three.js (~1.3MB)
const ModelModal = lazy(() => import('./ModelModal'));
const UploadForm = lazy(() => import('./UploadForm'));
const EditModelForm = lazy(() => import('./EditModelForm'));
const ThumbnailGenerator = lazy(() => import('./ThumbnailGenerator'));

const categories = [
  { key: 'all', label: 'Todos' },
  { key: 'personaje', label: 'Personaje' },
  { key: 'vehiculo', label: 'Vehículo' },
  { key: 'criatura', label: 'Criatura' },
  { key: 'objeto', label: 'Objeto' },
];

export default function Gallery() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
  const [reorderMode, setReorderMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showThumbGen, setShowThumbGen] = useState(false);
  const [thumbRegenAll, setThumbRegenAll] = useState(false);
  const modalCounter = useRef(0);
  const loadVersionRef = useRef(0);

  const isLoggedIn = !!userId;
  const isAdmin = profile?.role === 'admin';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const loadModels = useCallback(async (isInitial = false) => {
    const version = ++loadVersionRef.current;

    if (isInitial) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [modelsData, counts, commentCountsData] = await Promise.all([
        fetchModels(),
        fetchLikeCounts(),
        fetchCommentCounts(),
      ]);
      if (loadVersionRef.current !== version) return;
      setModels(modelsData);
      setLikeCounts(counts);
      setCommentCounts(commentCountsData);
    } catch (err) {
      console.error('Error loading models:', err);
    } finally {
      if (loadVersionRef.current === version) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSaveStatus('saving');
    setModels((prev) => {
      const oldIndex = prev.findIndex((m) => m.id === active.id);
      const newIndex = prev.findIndex((m) => m.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      const updates = reordered.map((m, i) => ({ id: m.id, sort_order: (i + 1) * 1000 }));
      updateModelOrder(updates).then((ok) => {
        setSaveStatus(ok ? 'saved' : 'idle');
        if (ok) setTimeout(() => setSaveStatus('idle'), 2000);
      });
      return reordered;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const { user, profile: p } = await initAuth();
        if (!isMounted) return;

        if (user) {
          setUserId(user.id);
          setProfile(p);
          try {
            const likes = await fetchUserLikes();
            if (isMounted) setUserLikes(new Set(likes));
          } catch { /* not logged in or error */ }
        }

        await loadModels(true);
      } catch (err) {
        console.error('[Gallery] Error en init:', err);
        if (isMounted) setInitialLoading(false);
      }
    };

    const unsub = onAuthStateChange(async (user) => {
      if (!isMounted) return;
      if (user) {
        setUserId(user.id);
        const p = await getMe();
        if (isMounted) setProfile(p);
        try {
          const likes = await fetchUserLikes();
          if (isMounted) setUserLikes(new Set(likes));
        } catch { /* ignore */ }
      } else {
        setUserId(null); setProfile(null); setUserLikes(new Set());
      }
    });

    init();

    return () => { isMounted = false; unsub(); };
  }, [loadModels]);

  // Auto-generar thumbnails si el admin carga y hay modelos sin thumbnail
  useEffect(() => {
    if (!isAdmin || initialLoading || models.length === 0) return;
    const missing = models.some((m) => !m.thumbnail_url);
    if (missing) setShowThumbGen(true);
  }, [isAdmin, initialLoading, models]);

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

    toggleLike(modelId).catch(() => {
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
    await deleteModel(model.id);
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
          {isAdmin && (
            <>
              <button
                className={`filter-btn reorder-btn ${reorderMode ? 'active' : ''}`}
                onClick={() => setReorderMode((r) => !r)}
                title={activeFilter !== 'all' ? 'Cambia a "Todos" para reordenar' : ''}
              >
                {reorderMode ? '✓ Fin reordenar' : '↕ Reordenar'}
              </button>
              <button
                className="filter-btn"
                onClick={() => { setThumbRegenAll(true); setShowThumbGen(true); }}
              >
                🖼 Regenerar Thumbnails
              </button>
            </>
          )}
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
      <div style={{ padding: '16px 48px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="counter">
          {initialLoading ? '...' : `${String(filteredModels.length).padStart(2, '0')} MODELOS`}
        </span>
        {refreshing && (
          <span className="gallery-refreshing-indicator">actualizando…</span>
        )}
        {saveStatus === 'saving' && (
          <span className="gallery-refreshing-indicator">guardando orden…</span>
        )}
        {saveStatus === 'saved' && (
          <span className="gallery-save-indicator">✓ guardado</span>
        )}
      </div>

      {/* Grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="gallery-grid">
          {initialLoading ? (
            <div className="gallery-loading">Cargando modelos...</div>
          ) : filteredModels.length === 0 ? (
            <div className="gallery-empty">
              {isLoggedIn
                ? 'No hay modelos. Usa "+ Subir Modelo" para agregar el primero.'
                : 'No hay modelos en esta categoría.'}
            </div>
          ) : reorderMode && activeFilter === 'all' ? (
            <SortableContext items={models.map((m) => m.id)} strategy={rectSortingStrategy}>
              {models.map((model) => (
                <SortableModelCard
                  key={model.id}
                  id={model.id}
                  reorderMode={true}
                  title={model.title}
                  student={model.student}
                  category={model.category}
                  tags={model.tags}
                  modelUrl={model.file_url}
                  thumbnailUrl={model.thumbnail_url}
                  canEdit={canEdit(model)}
                  likeCount={likeCounts[model.id] || 0}
                  commentCount={commentCounts[model.id] || 0}
                  isLiked={userLikes.has(model.id)}
                  onLike={() => handleToggleLike(model.id)}
                  onClick={() => handleOpenModal(model)}
                  onEdit={() => setEditingModel(model)}
                  onDelete={() => setDeleteConfirm(model)}
                />
              ))}
            </SortableContext>
          ) : (
            filteredModels.map((model) => (
              <ModelCard
                key={model.id}
                title={model.title}
                student={model.student}
                category={model.category}
                tags={model.tags}
                modelUrl={model.file_url}
                thumbnailUrl={model.thumbnail_url}
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
      </DndContext>

      <Suspense fallback={null}>
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
          thumbnailUrl={selectedModel.thumbnail_url}
          mviewUrl={selectedModel.mview_url}
          mviewThumbnailUrl={selectedModel.mview_thumbnail_url}
          userId={userId}
          isAdmin={isAdmin}
          likeCount={likeCounts[selectedModel.id] || 0}
          isLiked={userLikes.has(selectedModel.id)}
          onLike={() => handleToggleLike(selectedModel.id)}
          onRequestAuth={() => setShowAuth(true)}
          onClose={() => setSelectedModel(null)}
        />
      )}

      {showUpload && (
        <UploadForm
          onSuccess={() => { setShowUpload(false); loadModels(); }}
          onClose={() => setShowUpload(false)}
        />
      )}

      {editingModel && (
        <EditModelForm
          key={editingModel.id}
          model={editingModel}
          onSave={() => { setEditingModel(null); loadModels(); }}
          onClose={() => setEditingModel(null)}
        />
      )}

      {showAuth && (
        <AuthModal
          onSuccess={() => setShowAuth(false)}
          onClose={() => setShowAuth(false)}
        />
      )}

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

      {showThumbGen && (
        <ThumbnailGenerator regenerateAll={thumbRegenAll} onDone={() => { setShowThumbGen(false); setThumbRegenAll(false); loadModels(); }} />
      )}
      </Suspense>
    </>
  );
}
