import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ModelCard from './ModelCard';

interface SortableModelCardProps {
  id: string;
  reorderMode: boolean;
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

export default function SortableModelCard({ id, reorderMode, ...props }: SortableModelCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: 'relative',
    zIndex: isDragging ? 100 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {reorderMode && (
        <button
          {...listeners}
          className="card-drag-handle"
          title="Arrastrar para reordenar"
          aria-label="Arrastrar para reordenar"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
            <circle cx="4" cy="3" r="1.4" />
            <circle cx="10" cy="3" r="1.4" />
            <circle cx="4" cy="7" r="1.4" />
            <circle cx="10" cy="7" r="1.4" />
            <circle cx="4" cy="11" r="1.4" />
            <circle cx="10" cy="11" r="1.4" />
          </svg>
        </button>
      )}
      <ModelCard {...props} />
    </div>
  );
}
