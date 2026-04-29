import { useMemo } from 'react';

/**
 * Visor de modelos .mview (Marmoset Toolbag) integrado vía iframe.
 *
 * Por qué iframe:
 *  - El script oficial `marmoset.js` (~242 KB) inyecta su propio canvas y maneja
 *    su lifecycle global. Encerrarlo en un iframe nos da:
 *      • Aislamiento total (el script no contamina nuestro DOM/CSS).
 *      • Cleanup automático cuando el componente se desmonta (el iframe muere).
 *      • Mismo comportamiento que el HTML wrapper que genera Marmoset Toolbag
 *        cuando un artista exporta su `.mview`, lo cual minimiza sorpresas.
 *
 * El script y el archivo `.mview` se sirven desde el mismo origen (Vite en dev,
 * nginx → bucket DO Spaces en prod), así que no hay problemas CORS.
 */
interface MarmosetViewerProps {
  /** URL pública del archivo .mview (ej: `/test-models/Bourgelon.mview` o `/cdn/models/...`). */
  url: string;
  /**
   * Ancho fijo en px. Si NO se pasa, el viewer entra en modo `fullFrame`
   * (ocupa el 100% del contenedor, responsive). Útil dentro de modales.
   */
  width?: number;
  /** Alto fijo en px. Mismo comportamiento que width — omitir para responsive. */
  height?: number;
  /** Si arranca automáticamente al cargar. Default true. */
  autoStart?: boolean;
}

export default function MarmosetViewer({
  url,
  width,
  height,
  autoStart = true,
}: MarmosetViewerProps) {
  // Modo fluido vs modo fijo:
  //   - Si NO se pasan dimensiones → fullFrame: true (canvas Marmoset ocupa
  //     100% del iframe, ideal para containers responsive como ModelModal).
  //   - Si SÍ se pasan → modo fijo con esas dimensiones (TestMarmoset, embeds
  //     con tamaño preestablecido, previews tipo polaroid).
  const isFluid = width === undefined || height === undefined;

  // useMemo evita regenerar el HTML (y remontar el viewer) en cada render.
  const srcDoc = useMemo(() => {
    const embedOptions = isFluid
      ? `{ autoStart: ${autoStart}, fullFrame: true }`
      : `{ width: ${width}, height: ${height}, autoStart: ${autoStart}, fullFrame: false, pagePreset: true }`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="user-scalable=0"/>
  <style>html,body{margin:0;padding:0;background:#0a0a0a;overflow:hidden;width:100%;height:100%;}</style>
  <script src="/marmoset.js"></script>
</head>
<body>
  <script>
    marmoset.embed(${JSON.stringify(url)}, ${embedOptions});
  </script>
</body>
</html>`;
  }, [url, width, height, autoStart, isFluid]);

  return (
    <iframe
      title="Marmoset Viewer"
      srcDoc={srcDoc}
      // Cuando es fluido, dejamos que CSS controle dimensiones (100%).
      // Cuando es fijo, pasamos width/height al iframe directamente.
      {...(isFluid ? {} : { width, height })}
      style={{
        border: 'none',
        display: 'block',
        background: '#0a0a0a',
        ...(isFluid
          ? { width: '100%', height: '100%' }
          : { maxWidth: '100%' }),
      }}
      // Sandbox: necesita scripts para correr marmoset.js, same-origin para
      // que el script pueda fetchear el .mview del mismo origen.
      sandbox="allow-scripts allow-same-origin"
      allow="fullscreen"
    />
  );
}
