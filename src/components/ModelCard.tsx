import { useState } from 'react';

interface ModelCardProps {
  title: string;
  student: string;
  category: string;
  tags: string[];
  modelUrl: string;
  thumbnailUrl?: string | null;
  canEdit: boolean;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  onLike: () => void;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
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

export default function ModelCard({
  title,
  student,
  category,
  tags,
  thumbnailUrl,
  canEdit,
  likeCount,
  commentCount,
  isLiked,
  onLike,
  onClick,
  onEdit,
  onDelete,
}: ModelCardProps) {
  const [animating, setAnimating] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnimating(true);
    setTimeout(() => setAnimating(false), 400);
    onLike();
  };

  return (
    <div className="card">
      <div className="card-viewer" onClick={onClick}>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="card-thumbnail"
            loading="lazy"
          />
        ) : (
          <div className="card-thumbnail-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <span>3D</span>
          </div>
        )}
        <div className="card-overlay-hover">
          <button className="view-btn">Ver en detalle</button>
        </div>
      </div>
      <div className="card-info" onClick={onClick}>
        <div
          className="card-category"
          style={{ color: categoryColors[category] || '#ff4d00' }}
        >
          {categoryLabels[category] || category}
        </div>
        <div className="card-title">{title}</div>
        <div className="card-student">Estudiante: {student}</div>
        <div className="card-tags">
          {tags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        <div className="card-like-row">
          <button
            className={`card-like-btn ${isLiked ? 'liked' : ''} ${animating ? 'like-animate' : ''}`}
            onClick={handleLike}
            aria-label={isLiked ? 'Quitar like' : 'Dar like'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
          <span className="card-like-count">{likeCount}</span>
          <span className="card-comment-icon" aria-label={`${commentCount} comentarios`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="card-comment-count">{commentCount}</span>
        </div>
      </div>

      {canEdit && (
        <div className="card-admin-actions">
          <button
            className="admin-btn admin-edit"
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            title="Editar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            className="admin-btn admin-delete"
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
            title="Eliminar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
