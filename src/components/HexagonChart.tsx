import { SKILLS, type StudentSkill } from '../lib/supabase';

interface Props {
  skills: StudentSkill[];
}

const ACCENT = '#00ff88';
const GRID_COLOR = '#2a2a2a';
const AXIS_COLOR = '#444444';
const LABEL_COLOR = '#a8b4c4';
const EMPTY_COLOR = '#333333';

// Divide label en dos líneas en el último espacio
function splitLabel(label: string): [string, string | null] {
  const idx = label.lastIndexOf(' ');
  if (idx === -1) return [label, null];
  return [label.slice(0, idx), label.slice(idx + 1)];
}

// ViewBox 300x260 — más ancho que alto para reducir altura de la tarjeta
const VW = 300;
const VH = 260;
const cx = VW / 2;   // 150
const cy = VH / 2;   // 130
const maxR = 66;
const labelOffset = 92;

const angle = (i: number) => (Math.PI / 180) * (i * 60 - 90);

const vertex = (i: number, r: number = maxR) => ({
  x: cx + r * Math.cos(angle(i)),
  y: cy + r * Math.sin(angle(i)),
});

const toPolygon = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

const gridLevels = [0.33, 0.66, 1.0];

export default function HexagonChart({ skills }: Props) {
  const valueMap: Record<string, number> = {};
  for (const s of skills) valueMap[s.skill_name] = s.value;

  const hasData = skills.length > 0;

  const dataPoints = SKILLS.map((s, i) => {
    const ratio = (valueMap[s.key] ?? 0) / 100;
    return {
      x: cx + maxR * ratio * Math.cos(angle(i)),
      y: cy + maxR * ratio * Math.sin(angle(i)),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="Gráfica de habilidades"
    >
      {/* Grid hexagonal */}
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={toPolygon(Array.from({ length: 6 }, (_, i) => vertex(i, maxR * level)))}
          fill="none" stroke={GRID_COLOR} strokeWidth={1}
        />
      ))}

      {/* Ejes */}
      {SKILLS.map((_, i) => {
        const v = vertex(i);
        return <line key={i} x1={cx} y1={cy} x2={v.x} y2={v.y} stroke={AXIS_COLOR} strokeWidth={1} />;
      })}

      {/* Polígono de datos */}
      {hasData ? (
        <>
          <polygon
            points={toPolygon(dataPoints)}
            fill={`${ACCENT}26`} stroke={ACCENT} strokeWidth={2} strokeLinejoin="round"
            style={{ transition: 'all 0.4s ease' }}
          />
          {dataPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={ACCENT} />)}
        </>
      ) : (
        <polygon
          points={toPolygon(Array.from({ length: 6 }, (_, i) => vertex(i, maxR * 0.3)))}
          fill={`${EMPTY_COLOR}40`} stroke={EMPTY_COLOR} strokeWidth={1.5} strokeDasharray="4 3"
        />
      )}

      {/* Labels */}
      {SKILLS.map((skill, i) => {
        const a = angle(i);
        const lx = cx + labelOffset * Math.cos(a);
        const ly = cy + labelOffset * Math.sin(a);
        const val = valueMap[skill.key];

        let textAnchor: 'start' | 'middle' | 'end' = 'middle';
        if (lx < cx - 10) textAnchor = 'end';
        else if (lx > cx + 10) textAnchor = 'start';

        const [line1, line2] = splitLabel(skill.label);
        const yBase = line2 ? ly - 5 : ly - 3;

        return (
          <g key={skill.key}>
            <text textAnchor={textAnchor} fontSize={8} fill={LABEL_COLOR}
              fontFamily="JetBrains Mono, monospace" fontWeight="600">
              <tspan x={lx} y={yBase}>{line1}</tspan>
              {line2 && <tspan x={lx} dy={10}>{line2}</tspan>}
            </text>
            {val !== undefined && (
              <text x={lx} y={line2 ? yBase + 22 : yBase + 12}
                textAnchor={textAnchor} fontSize={8} fill={ACCENT}
                fontFamily="JetBrains Mono, monospace" fontWeight="600">
                {val}
              </text>
            )}
          </g>
        );
      })}

      <circle cx={cx} cy={cy} r={2.5} fill={AXIS_COLOR} />
    </svg>
  );
}
