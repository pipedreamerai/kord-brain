'use client';

export type BrainNode = { slug: string; title: string; kind: string };
export type BrainEdge = { from: string; to: string; kind: string };

type Props = {
  nodes: BrainNode[];
  edges: BrainEdge[];
};

const W = 520;
const H = 380;
const CX = W / 2;
const CY = H / 2;
const INNER_R = 90;   // document ring
const OUTER_R = 162;  // tag ring
const OTHER_R = 200;  // unknown / misc
const NODE_R = 8;
const ROOT_R = 13;

function nodeFill(kind: string): string {
  if (kind === 'document') return '#6366f1';
  if (kind === 'tag') return '#f59e0b';
  return '#71717a';
}
function nodeStroke(kind: string): string {
  if (kind === 'document') return '#4338ca';
  if (kind === 'tag') return '#b45309';
  return '#52525b';
}
function labelFill(kind: string): string {
  if (kind === 'document') return '#c7d2fe';
  if (kind === 'tag') return '#fde68a';
  return '#a1a1aa';
}

function truncate(s: string, max = 13): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function placeNodes(nodes: BrainNode[]) {
  const docs = nodes.filter(n => n.kind === 'document');
  const tags = nodes.filter(n => n.kind === 'tag');
  const others = nodes.filter(n => n.kind !== 'document' && n.kind !== 'tag');
  const positions = new Map<string, { x: number; y: number }>();

  const place = (list: BrainNode[], r: number, offsetAngle = -Math.PI / 2) => {
    list.forEach((n, i) => {
      const angle = offsetAngle + (i / Math.max(1, list.length)) * Math.PI * 2;
      positions.set(n.slug, {
        x: CX + Math.cos(angle) * r,
        y: CY + Math.sin(angle) * r,
      });
    });
  };

  place(docs, INNER_R, -Math.PI / 2);
  place(tags, OUTER_R, -Math.PI / 2);
  place(others, OTHER_R, 0);
  return positions;
}

export function FullGbrainGraph({ nodes, edges }: Props) {
  const positions = placeNodes(nodes);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-full select-none"
      aria-label="gbrain knowledge graph"
    >
      <defs>
        <marker
          id="gb-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="4"
          markerHeight="4"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L8,4 L0,8 z" fill="#3f3f46" />
        </marker>
        <radialGradient id="brain-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ring guides */}
      {nodes.some(n => n.kind === 'document') && (
        <circle cx={CX} cy={CY} r={INNER_R} fill="none" stroke="#27272a" strokeWidth={0.5} strokeDasharray="4,4" />
      )}
      {nodes.some(n => n.kind === 'tag') && (
        <circle cx={CX} cy={CY} r={OUTER_R} fill="none" stroke="#27272a" strokeWidth={0.5} strokeDasharray="4,4" />
      )}

      {/* Center brain node */}
      <circle cx={CX} cy={CY} r={ROOT_R + 8} fill="url(#brain-glow)" />
      <circle cx={CX} cy={CY} r={ROOT_R} fill="#10b981" stroke="#059669" strokeWidth={1.5}>
        <animate attributeName="r" values={`${ROOT_R};${ROOT_R + 2};${ROOT_R}`} dur="3s" repeatCount="indefinite" />
      </circle>
      <text
        x={CX}
        y={CY + 4}
        textAnchor="middle"
        style={{ font: '700 8px ui-monospace, SFMono-Regular, monospace', fill: 'white' }}
      >
        brain
      </text>

      {/* Edges */}
      {edges.map((e, i) => {
        const a = positions.get(e.from);
        const b = positions.get(e.to);
        if (!a || !b) return null;
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const fromR = NODE_R + 1;
        const toR = NODE_R + 2;
        return (
          <line
            key={`e-${i}`}
            x1={a.x + ux * fromR}
            y1={a.y + uy * fromR}
            x2={b.x - ux * toR}
            y2={b.y - uy * toR}
            stroke="#3f3f46"
            strokeWidth={0.8}
            markerEnd="url(#gb-arrow)"
          >
            <animate attributeName="opacity" from="0" to="1" dur="0.4s" fill="freeze" />
          </line>
        );
      })}

      {/* Nodes */}
      {nodes.map(n => {
        const pos = positions.get(n.slug);
        if (!pos) return null;
        const angle = Math.atan2(pos.y - CY, pos.x - CX);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const anchor: 'start' | 'middle' | 'end' =
          cosA > 0.25 ? 'start' : cosA < -0.25 ? 'end' : 'middle';
        const lx = pos.x + cosA * (NODE_R + 7);
        const ly = pos.y + sinA * (NODE_R + 7) + (sinA > 0 ? 9 : 0);

        return (
          <g key={n.slug}>
            <title>{n.title}</title>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={NODE_R}
              fill={nodeFill(n.kind)}
              stroke={nodeStroke(n.kind)}
              strokeWidth={1.5}
            >
              <animate attributeName="r" from="0" to={String(NODE_R)} dur="0.35s" fill="freeze" />
              <animate attributeName="opacity" from="0" to="1" dur="0.35s" fill="freeze" />
            </circle>
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              style={{ font: '500 8px ui-monospace, SFMono-Regular, monospace', fill: labelFill(n.kind) }}
            >
              <animate attributeName="opacity" from="0" to="1" dur="0.5s" fill="freeze" />
              {truncate(n.slug)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
