import { Canvas } from '@react-three/fiber';
import { View } from '@react-three/drei';

export default function SceneCanvas() {
  return (
    <Canvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1,
      }}
      eventSource={document.getElementById('root')!}
      eventPrefix="client"
      camera={{ position: [0, 0, 5], fov: 40 }}
      gl={{ antialias: false, powerPreference: 'low-power' }}
      dpr={[1, 1.5]}
    >
      <View.Port />
    </Canvas>
  );
}
