import { useState, lazy, Suspense } from 'react';
import MarmosetViewer from './MarmosetViewer';

const LazyCanvas = lazy(() => import('@react-three/fiber').then(m => ({ default: m.Canvas })));
const ModelScene = lazy(() => import('./ModelScene'));

/**
 * Carrusel Flip Card 3D — alterna entre la versión Marmoset (.mview)
 * y la versión GLB del estudiante mediante un giro tipo carta sobre eje Y.
 *
 * Diseño:
 *  - Default: Marmoset al frente (la versión "premium" del docente).
 *  - Toggle inferior con dos chips estilo polaroid; el activo brilla en acento.
 *  - Ambos viewers permanecen montados (no se recrean al flip) para que el
 *    cambio sea instantáneo y no se pierda el estado del modelo.
 *  - backface-visibility: hidden evita que se vean las dos caras al mismo tiempo.
 *
 * Performance trade-off: ambos viewers corren en paralelo siempre. Aceptable
 * porque el usuario ya abrió el modal — no es viewer pasivo en background.
 */
interface ShowcaseCarouselProps {
  glbUrl: string;
  mviewUrl: string;
  /** Poster .webp generado client-side al subir el .glb (puede ser null para modelos antiguos). */
  glbThumbnail?: string | null;
  /** Poster .png/.jpg subido manualmente por el docente con el .mview. */
  mviewThumbnail?: string | null;
  /** Callback cuando el .glb termina de cargar (para fade-in del placeholder). */
  onGlbLoaded?: () => void;
}

export default function ShowcaseCarousel({
  glbUrl,
  mviewUrl,
  glbThumbnail,
  mviewThumbnail,
  onGlbLoaded,
}: ShowcaseCarouselProps) {
  // Default: Marmoset al frente (decisión de Carlos en el plan v3.3.0).
  const [activeView, setActiveView] = useState<'mview' | 'glb'>('mview');
  const flipped = activeView === 'glb';

  return (
    <div className="showcase-carousel">
      <div className={`showcase-flipper ${flipped ? 'flipped' : ''}`}>
        {/* Cara 1 (frontal) — Marmoset Showcase
            Sin width/height → modo fullFrame: el canvas WebGL ocupa el 100% del
            iframe responsive, queda centrado dentro del modal sin importar tamaño. */}
        <div className="showcase-face showcase-face--mview">
          <MarmosetViewer url={mviewUrl} />
        </div>

        {/* Cara 2 (trasera) — GLB del estudiante */}
        <div className="showcase-face showcase-face--glb">
          <Suspense fallback={null}>
            <LazyCanvas
              camera={{ position: [3, 2, 3], fov: 40 }}
              gl={{ antialias: true }}
              style={{ width: '100%', height: '100%' }}
            >
              <ModelScene
                url={glbUrl}
                autoRotate={false}
                enableZoom={true}
                enablePan={true}
                enableRotate={true}
                showFloor={true}
                onLoaded={onGlbLoaded}
              />
            </LazyCanvas>
          </Suspense>
        </div>
      </div>

      {/* Toggle inferior — dos chips polaroid */}
      <div className="showcase-toggle" role="tablist" aria-label="Cambiar vista del modelo">
        <button
          type="button"
          role="tab"
          aria-selected={!flipped}
          className={`showcase-chip ${!flipped ? 'active' : ''}`}
          onClick={() => setActiveView('mview')}
        >
          {mviewThumbnail ? (
            <img src={mviewThumbnail} alt="Showcase" className="showcase-chip-thumb" />
          ) : (
            <div className="showcase-chip-thumb showcase-chip-thumb--placeholder">
              <span>M</span>
            </div>
          )}
          <div className="showcase-chip-meta">
            <span className="showcase-chip-label">Showcase</span>
            <span className="showcase-chip-sub">Marmoset · PBR</span>
          </div>
          {!flipped && <span className="showcase-chip-dot" aria-hidden="true" />}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={flipped}
          className={`showcase-chip ${flipped ? 'active' : ''}`}
          onClick={() => setActiveView('glb')}
        >
          {glbThumbnail ? (
            <img src={glbThumbnail} alt="Modelo del estudiante" className="showcase-chip-thumb" />
          ) : (
            <div className="showcase-chip-thumb showcase-chip-thumb--placeholder">
              <span>G</span>
            </div>
          )}
          <div className="showcase-chip-meta">
            <span className="showcase-chip-label">Modelo</span>
            <span className="showcase-chip-sub">GLB · Estudiante</span>
          </div>
          {flipped && <span className="showcase-chip-dot" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
