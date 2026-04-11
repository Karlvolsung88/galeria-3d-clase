import Gallery from '../components/Gallery';

export default function GaleriaPage() {
  return (
    <>
      <header className="hero">
        <div className="hero-grid-bg"></div>
        <div className="hero-glow hero-glow-1"></div>
        <div className="hero-glow hero-glow-2"></div>
        <div className="hero-glow hero-glow-3"></div>

        <div className="hero-content">
          <div className="hero-label">
            <span className="hero-label-line"></span>
            <span>Estudio de Creación Digital 4</span>
            <span className="hero-label-dot">●</span>
            <span>Semestre 2026-1</span>
          </div>

          <div className="hero-titles">
            <div className="hero-title-row">
              <h1 className="hero-title-main">GALERÍA</h1>
              <div className="hero-title-accent">
                <span className="hero-star">✦</span>
              </div>
            </div>
            <div className="hero-title-row hero-title-row-2">
              <div className="hero-title-badge">
                <span>INTERACTIVA</span>
              </div>
              <h1 className="hero-title-main hero-title-outline">DE MODELOS</h1>
            </div>
            <div className="hero-title-row hero-title-row-3">
              <h1 className="hero-title-3d">3D</h1>
              <p className="hero-description">
                Explora modelos 3D creados por nuestros estudiantes.<br />
                Materiales PBR, iluminación profesional, listos para<br />
                experiencias web, AR y VR.
              </p>
            </div>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-icon">↓</span>
              <span className="hero-stat-text">Scroll para explorar</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-stars">★★★★★</span>
              <span className="hero-stat-text">Calidad PBR</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-text">Formatos GLB · GLTF</span>
            </div>
            <div className="hero-stat hero-stat-end">
              <span className="hero-stat-text">Universidad El Bosque</span>
              <span className="hero-stat-icon">↗</span>
            </div>
          </div>
        </div>
      </header>

      <main id="galeria">
        <Gallery />
      </main>

      <footer>
        <p>© 2026 Estudio de Creación Digital 4 — Universidad El Bosque</p>
        <p>GLB · PBR · WebXR</p>
      </footer>
    </>
  );
}
