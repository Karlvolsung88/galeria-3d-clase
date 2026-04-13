import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows } from '@react-three/drei';
import Model3D from './Model3D';
import ThumbnailCapture from './ThumbnailCapture';
import { fetchModels, uploadThumbnail, type ModelRow } from '../lib/api';

/**
 * Componente admin: genera thumbnails para modelos.
 * regenerateAll=true procesa TODOS los modelos (para regenerar con mejor calidad).
 * regenerateAll=false (default) solo procesa los que no tienen thumbnail.
 */
export default function ThumbnailGenerator({ onDone, regenerateAll = false }: { onDone: () => void; regenerateAll?: boolean }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [status, setStatus] = useState(regenerateAll ? 'Cargando todos los modelos...' : 'Cargando modelos sin thumbnail...');
  const [done, setDone] = useState(false);
  const processingRef = useRef(false);

  useEffect(() => {
    fetchModels().then((data) => {
      const targets = regenerateAll ? data : data.filter((m) => !m.thumbnail_url);
      if (targets.length > 0) {
        setModels(targets);
        setCurrentIndex(0);
        setStatus(`0/${targets.length} — Preparando...`);
      } else {
        setStatus('Todos los modelos ya tienen thumbnail.');
        setDone(true);
      }
    });
  }, [regenerateAll]);

  const handleCapture = useCallback(async (blob: Blob) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const model = models[currentIndex];
    if (!model) return;

    setStatus(`${currentIndex + 1}/${models.length} — Subiendo ${model.title}...`);

    try {
      await uploadThumbnail(model.id, blob);
    } catch (err) {
      console.error('Thumbnail upload error:', err);
    }

    processingRef.current = false;

    if (currentIndex + 1 < models.length) {
      setCurrentIndex(currentIndex + 1);
      setStatus(`${currentIndex + 1}/${models.length} — Completado ${model.title}`);
    } else {
      setStatus(`${models.length}/${models.length} — Todos completados.`);
      setDone(true);
    }
  }, [models, currentIndex]);

  const currentModel = models[currentIndex];

  return (
    <div className="modal-overlay active" onClick={(e) => { if (e.target === e.currentTarget && done) onDone(); }}>
      <div className="upload-modal" style={{ maxWidth: '540px' }}>
        <div className="upload-header">
          <h2 className="upload-title">Generar Thumbnails</h2>
        </div>
        <div className="upload-body">
          <p style={{ color: 'var(--muted)', fontSize: '13px', fontFamily: 'JetBrains Mono, monospace', marginBottom: '16px' }}>
            {status}
          </p>

          {currentModel && !done && (
            <div style={{ width: '720px', height: '405px', background: '#1a1a1a', borderRadius: '4px', overflow: 'hidden', maxWidth: '100%' }}>
              <Canvas
                key={currentModel.id}
                camera={{ position: [2.5, 1.8, 2.5], fov: 40 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
                dpr={2}
                style={{ width: '720px', height: '405px' }}
              >
                <color attach="background" args={['#1a1a1a']} />
                <Environment preset="studio" background={false} environmentIntensity={0.5} />
                <ambientLight intensity={0.2} />
                <directionalLight position={[5, 8, 3]} intensity={0.4} castShadow />
                <directionalLight position={[-3, 4, -2]} intensity={0.15} />
                {/* Model3D + ThumbnailCapture DENTRO de Suspense:
                    ThumbnailCapture solo se monta cuando el GLB ya cargó */}
                <Suspense fallback={null}>
                  <Model3D url={currentModel.file_url} />
                  <ThumbnailCapture onCapture={handleCapture} />
                </Suspense>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
                  <planeGeometry args={[50, 50]} />
                  <meshStandardMaterial color="#222222" roughness={1} metalness={0} />
                </mesh>
                <ContactShadows position={[0, -1.09, 0]} opacity={0.5} scale={8} blur={2.5} far={4} />
              </Canvas>
            </div>
          )}

          {done && (
            <div className="upload-actions">
              <button className="upload-submit" onClick={onDone}>Cerrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
