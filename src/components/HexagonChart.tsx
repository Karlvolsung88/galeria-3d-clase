import { SKILLS, type StudentSkill } from '../lib/supabase';

interface Props {
  skills: StudentSkill[];
  size?: number;
}

const ACCENT = '#00ff88';
const GRID_COLOR = '#2a2a2a';
const AXIS_COLOR = '#333333';
const LABEL_COLOR = '#888888';
const EMPTY_COLOR = '#333333';

export default function HexagonChart({ skills, size = 220 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 36; // margen para labels

  // Construir mapa de valores por skill_name
  const valueMap: Record<string, number> = {};
  for (const s of skills) {
    valueMap[s.skill_name] = s.value;
  }

  const hasData = skills.length > 0;

  // Ángulo de cada eje: empezando desde arriba (-90°), sentido horario
  const angle = (i: number) => (Math.PI / 180) * (i * 60 - 90);

  // Punto en el SVG para un valor y un índice de eje
  const point = (value: number, i: number, r: number = maxR) => {
    const ratio = value / 100;
    return {
      x: cx + r * ratio * Math.cos(angle(i)),
      y: cy + r * ratio * Math.sin(angle(i)),
    };
  };

  // Vértice del hexágono de fondo (radio 1)
  const vertex = (i: number, r: number = maxR) => ({
    x: cx + r * Math.cos(angle(i)),
    y: cy + r * Math.sin(angle(i)),
  });

  // Construir string de puntos para un polígono SVG
  const toPolygon = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

  // Grid: 3 hexágonos concéntricos al 33%, 66% y 100%
  const gridLevels = [0.33, 0.66, 1.0];

  // Polígono de datos del estudiante
  const dataPoints = SKILLS.map((s, i) => {
    const val = valueMap[s.key] ?? 0;
    return point(val, i);
  });

  // Posición de los labels (ligeramente fuera del radio máximo)
  const labelOffset = maxR + 18;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="Gráfica de habilidades"
    >
      {/* Grid hexagonal de fondo */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={toPolygon(Array.from({ length: 6 }, (_, i) => vertex(i, maxR * level)))}
          fill="none"
          stroke={GRID_COLOR}
          strokeWidth={1}
        />
      ))}

      {/* Ejes desde el centro a cada vértice */}
      {SKILLS.map((_, i) => {
        const v = vertex(i);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={v.x} y2={v.y}
            stroke={AXIS_COLOR}
            strokeWidth={1}
          />
        );
      })}

      {/* Polígono de datos */}
      {hasData ? (
        <>
          <polygon
            points={toPolygon(dataPoints)}
            fill={`${ACCENT}26`}
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ transition: 'all 0.4s ease' }}
          />
          {/* Puntos en cada vértice del polígono */}
          {dataPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={ACCENT} />
          ))}
        </>
      ) : (
        /* Estado vacío: hexágono al 30% con color neutro */
        <polygon
          points={toPolygon(Array.from({ length: 6 }, (_, i) => vertex(i, maxR * 0.3)))}
          fill={`${EMPTY_COLOR}40`}
          stroke={EMPTY_COLOR}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {/* Labels de habilidades */}
      {SKILLS.map((skill, i) => {
        const a = angle(i);
        const lx = cx + labelOffset * Math.cos(a);
        const ly = cy + labelOffset * Math.sin(a);
        const val = valueMap[skill.key];

        // Alineación del texto según posición angular
        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        const deg = (i * 60 - 90 + 360) % 360;
        if (deg > 15 && deg < 165) textAnchor = 'middle';
        else if (deg >= 165 && deg <= 195) textAnchor = 'middle';
        else if (deg > 195 && deg < 345) textAnchor = 'middle';
        if (deg > 30 && deg < 150) textAnchor = 'middle';
        if (deg >= 0 && deg <= 30) textAnchor = 'middle';
        if (deg > 330) textAnchor = 'middle';
        // Ajuste fino por posición izquierda/derecha
        if (lx < cx - 10) textAnchor = 'end';
        else if (lx > cx + 10) textAnchor = 'start';

        return (
          <g key={skill.key}>
            <text
              x={lx}
              y={ly - 4}
              textAnchor={textAnchor}
              fontSize={9.5}
              fill={LABEL_COLOR}
              fontFamily="JetBrains Mono, monospace"
              fontWeight="500"
            >
              {skill.label}
            </text>
            {val !== undefined && (
              <text
                x={lx}
                y={ly + 9}
                textAnchor={textAnchor}
                fontSize={9}
                fill={ACCENT}
                fontFamily="JetBrains Mono, monospace"
              >
                {val}
              </text>
            )}
          </g>
        );
      })}

      {/* Punto central */}
      <circle cx={cx} cy={cy} r={2.5} fill={AXIS_COLOR} />
    </svg>
  );
}
