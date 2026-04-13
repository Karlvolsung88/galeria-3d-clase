import { useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

interface ThumbnailCaptureProps {
  /** Se llama una vez con el blob WebP cuando el frame está listo */
  onCapture: (blob: Blob) => void;
}

/**
 * Se monta dentro de un Canvas con preserveDrawingBuffer=true.
 * Espera unos frames para que el modelo, luces y sombras se estabilicen,
 * luego captura el canvas como WebP y llama onCapture.
 */
export default function ThumbnailCapture({ onCapture }: ThumbnailCaptureProps) {
  const { gl } = useThree();
  const frameCount = useRef(0);
  const captured = useRef(false);

  useFrame(() => {
    if (captured.current) return;
    frameCount.current += 1;

    // Esperar 30 frames para que sombras y luces se estabilicen
    // (este componente debe montarse DENTRO de Suspense, después de Model3D)
    if (frameCount.current < 30) return;
    captured.current = true;

    gl.domElement.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/webp',
      0.85
    );
  });

  return null;
}
