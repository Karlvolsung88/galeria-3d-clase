import MarmosetViewer from '../components/MarmosetViewer';

/**
 * Página de prototipo — SOLO LOCAL.
 * Esta ruta `/test-marmoset` no debe llegar a producción.
 * Su único propósito es verificar que el componente MarmosetViewer
 * carga y renderiza correctamente el archivo de prueba `Bourgelon.mview`.
 *
 * Eliminar antes del Sprint 5 (deploy):
 *  - Borrar este archivo
 *  - Quitar la ruta `<Route path="/test-marmoset" ...>` de App.tsx
 */
export default function TestMarmoset() {
  return (
    <main style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: 2 }}>
        🧪 Test — Marmoset Viewer
      </h1>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: '#888' }}>
        Archivo: <code>/test-models/Bourgelon.mview</code> · 1.95 MB · Samuel Parada
      </p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#666', marginBottom: 20 }}>
        Si ves el modelo abajo y puedes orbitar/zoom: el viewer funciona ✅<br />
        Esta página es solo para prototipo y se elimina antes del deploy.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <MarmosetViewer
          url="/test-models/Bourgelon.mview"
          width={1024}
          height={720}
        />
      </div>
    </main>
  );
}
