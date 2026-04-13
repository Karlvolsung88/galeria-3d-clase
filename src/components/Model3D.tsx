import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Vector3, NoColorSpace } from 'three';

interface Model3DProps {
  url: string;
}

/**
 * Carga un modelo GLB/GLTF, lo centra en el origen,
 * normaliza su escala a tamaño uniforme, y corrige
 * el color space de los non-color maps (normal, roughness, metalness, AO).
 */
// Habilitar decodificador Draco para modelos con KHR_draco_mesh_compression
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

export default function Model3D({ url }: Model3DProps) {
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    const cloned = scene.clone(true);

    // Fix color space: non-color maps deben estar en espacio lineal (OpenGL/Blender)
    cloned.traverse((child: any) => {
      if (child.isMesh && child.material) {
        const mat = child.material;
        if (mat.normalMap) mat.normalMap.colorSpace = NoColorSpace;
        if (mat.roughnessMap) mat.roughnessMap.colorSpace = NoColorSpace;
        if (mat.metalnessMap) mat.metalnessMap.colorSpace = NoColorSpace;
        if (mat.aoMap) mat.aoMap.colorSpace = NoColorSpace;
      }
    });

    // 1. Escalar para normalizar tamaño
    const box1 = new Box3().setFromObject(cloned);
    const size = box1.getSize(new Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim > 0 ? 2 / maxDim : 1;
    cloned.scale.multiplyScalar(s);

    // 2. Recalcular bounding box post-escala y centrar en origen
    cloned.updateMatrixWorld(true);
    const box2 = new Box3().setFromObject(cloned);
    const center = box2.getCenter(new Vector3());
    cloned.position.sub(center);

    return cloned;
  }, [scene]);

  return <primitive object={model} />;
}
