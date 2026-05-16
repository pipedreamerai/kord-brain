'use client';

type Neighbor = { slug: string; kind: 'tag' | 'document' | 'unknown'; title: string };
type Edge = { from: string; to: string; kind: string };

type Props = {
  root: string;
  neighbors: Neighbor[];
  edges: Edge[];
  onNodeClick?: (slug: string, kind: Neighbor['kind']) => void;
};

const W = 320;
const H = 220;
const CX = W / 2;
const CY = H / 2;
const R = 78;
const NODE_R = 7;
const ROOT_R = 9;

function fill(kind: Neighbor['kind'] | 'root'): string {
  if (kind === 'root') return '#10b981';
  if (kind === 'document') return '#6366f1';
  if (kind === 'tag') return '#f59e0b';
  return '#a1a1aa';
}

export function GbrainGraph({ root, neighbors, edges, onNodeClick }: Props) {
  const n = neighbors.length;
  const positions = new Map<string, { x: number; y: number; angle: number }>();
  positions.set(root, { x: CX, y: CY, angle: 0 });
  neighbors.forEach((nb, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    positions.set(nb.slug, {
      x: CX + Math.cos(angle) * R,
      y: CY + Math.sin(angle) * R,
      angle,
    });
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label={`gbrain graph for ${root}`}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#a1a1aa" />
        </marker>
      </defs>

      {edges.map((e, i) => {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const startR = e.from === root ? ROOT_R + 1 : NODE_R + 1;
        const endR = e.to === root ? ROOT_R + 1 : NODE_R + 2;
        return (
          <line
            key={`e-${i}`}
            x1={a.x + ux * startR}
            y1={a.y + uy * startR}
            x2={b.x - ux * endR}
            y2={b.y - uy * endR}
            stroke="#d4d4d8"
            strokeWidth={1}
            markerEnd="url(#arrow)"
          />
        );
      })}

      <g key={`node-${root}`}>
        <circle cx={CX} cy={CY} r={ROOT_R} fill={fill('root')} stroke="#047857" strokeWidth={1.5} />
        <text
          x={CX}
          y={CY + ROOT_R + 12}
          textAnchor="middle"
          className="fill-emerald-900"
          style={{ font: '700 10px ui-monospace, SFMono-Regular, monospace' }}
        >
          {root}
        </text>
      </g>

      {neighbors.map((nb) => {
        const pos = positions.get(nb.slug);
        if (!pos) return null;
        const cosA = Math.cos(pos.angle);
        const sinA = Math.sin(pos.angle);
        const anchor: 'start' | 'middle' | 'end' =
          cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle';
        const labelX = pos.x + cosA * (NODE_R + 6);
        const labelY = pos.y + sinA * (NODE_R + 6) + (sinA > 0 ? 9 : 0);
        return (
          <g
            key={`node-${nb.slug}`}
            onClick={() => onNodeClick?.(nb.slug, nb.kind)}
            className={onNodeClick ? 'cursor-pointer' : undefined}
          >
            <title>{nb.title}</title>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_R}
              fill={fill(nb.kind)}
              stroke="white"
              strokeWidth={1.5}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor={anchor}
              className="fill-zinc-700"
              style={{ font: '500 9.5px ui-monospace, SFMono-Regular, monospace' }}
            >
              {nb.slug}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
