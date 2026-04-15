import { Suspense, useEffect } from 'react';
import { Environment, ContactShadows, OrbitControls, Html } from '@react-three/drei';
import Model3D from './Model3D';

/** Componente invisible que notifica cuando se monta (modelo cargó) */
function LoadNotifier({ onLoaded }: { onLoaded?: () => void }) {
  useEffect(() => { onLoaded?.(); }, [onLoaded]);
  return null;
}

interface ModelSceneProps {
  url: string;
  /** Auto-rotate el modelo */
  autoRotate?: boolean;
  /** Permitir zoom con scroll */
  enableZoom?: boolean;
  /** Permitir paneo con click derecho */
  enablePan?: boolean;
  /** Permitir rotación manual con click izquierdo */
  enableRotate?: boolean;
  /** Mostrar suelo mate con contact shadows */
  showFloor?: boolean;
  /** Callback cuando el modelo terminó de cargar */
  onLoaded?: () => void;
}

/**
 * Escena 3D reutilizable con iluminación estilo studio,
 * suelo mate con contact shadows, y controles orbitales.
 */
export default function ModelScene({
  url,
  autoRotate = false,
  enableZoom = true,
  enablePan = true,
  enableRotate = true,
  showFloor = true,
  onLoaded,
}: ModelSceneProps) {
  return (
    <>
      {/* Fondo + fog */}
      <color attach="background" args={['#1a1a1a']} />
      <fog attach="fog" args={['#1a1a1a', 6, 14]} />

      {/* Iluminación studio */}
      <Environment preset="studio" background={false} environmentIntensity={0.4} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 3]} intensity={0.35} castShadow />
      <directionalLight position={[-3, 4, -4]} intensity={0.1} color="#8899aa" />

      {/* Modelo */}
      <Suspense fallback={<Html center><span style={{ color: '#555', fontSize: '13px' }}>Cargando 3D...</span></Html>}>
        <Model3D url={url} />
        <LoadNotifier onLoaded={onLoaded} />
      </Suspense>

      {/* Suelo mate + sombras */}
      {showFloor && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <meshStandardMaterial color="#222222" roughness={1} metalness={0} />
          </mesh>
          <ContactShadows position={[0, -1.09, 0]} opacity={0.5} scale={8} blur={2.5} far={4} />
        </>
      )}

      {/* Controles */}
      <OrbitControls
        target={[0, 0, 0]}
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
        enableZoom={enableZoom}
        enablePan={enablePan}
        enableRotate={enableRotate}
        minPolarAngle={enableRotate ? 0 : Math.PI / 4}
        maxPolarAngle={enableRotate ? Math.PI : Math.PI / 1.6}
        makeDefault
      />
    </>
  );
}
