import { useEffect, useCallback, useState, lazy, Suspense } from 'react';
import { fetchComments, addComment, deleteComment, type CommentRow } from '../lib/api';

const LazyCanvas = lazy(() => import('@react-three/fiber').then(m => ({ default: m.Canvas })));
const ModelScene = lazy(() => import('./ModelScene'));

interface ModelModalProps {
  modelId: string;
  title: string;
  student: string;
  category: string;
  description: string;
  tags: string[];
  modelUrl: string;
  thumbnailUrl?: string | null;
  userId: string | null;
  isAdmin: boolean;
  likeCount: number;
  isLiked: boolean;
  onLike: () => void;
  onRequestAuth: () => void;
  onClose: () => void;
}

const categoryColors: Record<string, string> = {
  personaje: '#ff4d00',
  vehiculo: '#00e5ff',
  criatura: '#a855f7',
  objeto: '#22c55e',
};

const categoryLabels: Record<string, string> = {
  personaje: 'Personaje',
  vehiculo: 'Vehículo',
  criatura: 'Criatura',
  objeto: 'Objeto',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}sem`;
}

export default function ModelModal({
  modelId, title, student, category, description, tags, modelUrl, thumbnailUrl,
  userId, isAdmin, likeCount, isLiked, onLike, onRequestAuth, onClose,
}: ModelModalProps) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);

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

  useEffect(() => {
    fetchComments(modelId).then(setComments);
  }, [modelId]);

  const handleLike = () => {
    if (!userId) { onRequestAuth(); return; }
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 400);
    onLike();
  };

  const handleSubmitComment = async () => {
    if (!userId) { onRequestAuth(); return; }
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    const comment = await addComment(modelId, newComment.trim());
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    }
    setSubmitting(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    await deleteComment(commentId);
  };

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Modelo: ${title}`}
    >
      <div className="modal">
        <div className="modal-viewer-wrap">
          <button className="modal-close" onClick={onClose} aria-label="Cerrar modal">✕</button>

          {/* Thumbnail placeholder (estilo Sketchfab) */}
          {thumbnailUrl && (
            <div className={`modal-thumb-placeholder ${modelLoaded ? 'hidden' : ''}`}>
              <img src={thumbnailUrl} alt={title} />
              <div className="modal-loading-spinner">
                <div className="spinner" />
                <span>Cargando modelo 3D...</span>
              </div>
            </div>
          )}

          {/* Canvas 3D con fade-in */}
          <div className={`modal-canvas-wrap ${modelLoaded ? 'loaded' : ''}`}>
            <Suspense fallback={null}>
              <LazyCanvas camera={{ position: [3, 2, 3], fov: 40 }} gl={{ antialias: true }}>
                <ModelScene
                  url={modelUrl}
                  autoRotate={false}
                  enableZoom={true}
                  enablePan={true}
                  enableRotate={true}
                  showFloor={true}
                  onLoaded={() => setModelLoaded(true)}
                />
              </LazyCanvas>
            </Suspense>
          </div>

          <div className="controls-hint">
            <span>LMB: Orbitar</span>
            <span>RMB: Paneo</span>
            <span>Scroll: Zoom</span>
          </div>
        </div>

        <div className="modal-panel">
          <div className="modal-panel-header">
            <div className="modal-category" style={{ color: categoryColors[category] || '#ff4d00' }}>
              {categoryLabels[category] || category}
            </div>
            <div className="modal-title">{title}</div>
            <div className="modal-student">Estudiante: {student}</div>
          </div>

          {/* Like bar */}
          <div className="modal-like-bar">
            <button
              className={`modal-like-btn ${isLiked ? 'liked' : ''} ${likeAnimating ? 'like-animate' : ''}`}
              onClick={handleLike}
              aria-label={isLiked ? 'Quitar like' : 'Dar like'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <span className="modal-like-count">
              {likeCount} {likeCount === 1 ? 'me gusta' : 'me gusta'}
            </span>
          </div>

          <div className="modal-desc">
            <div className="modal-desc-label">Descripción</div>
            <p>{description}</p>
          </div>

          <div className="modal-tags">
            {tags.map((tag) => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>

          {/* Comments section */}
          <div className="comments-section">
            <div className="comments-header">
              Comentarios ({comments.length})
            </div>
            <div className="comments-list">
              {comments.length === 0 && (
                <div className="comments-empty">Sin comentarios aún</div>
              )}
              {comments.map((c) => (
                <div key={c.id} className="comment-item">
                  <div className="comment-meta">
                    <div className="comment-meta-left">
                      <span className="comment-author">
                        {c.profiles?.full_name || 'Usuario'}
                      </span>
                      <span className="comment-time">{timeAgo(c.created_at)}</span>
                    </div>
                    {(userId === c.user_id || isAdmin) && (
                      <button
                        className="comment-delete"
                        onClick={() => handleDeleteComment(c.id)}
                        title="Eliminar comentario"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div className="comment-text">{c.text}</div>
                </div>
              ))}
            </div>

            {userId ? (
              <div className="comment-input-row">
                <input
                  className="comment-input"
                  type="text"
                  placeholder="Escribe un comentario..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
                  maxLength={500}
                />
                <button
                  className="comment-submit"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || submitting}
                >
                  Enviar
                </button>
              </div>
            ) : (
              <div className="comment-login-prompt">
                <span onClick={onRequestAuth}>Inicia sesión para comentar</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
