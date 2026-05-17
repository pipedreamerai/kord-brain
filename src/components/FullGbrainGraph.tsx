'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

type ForceGraphHandle = {
  d3Force: (name: string) => { strength?: (n: number) => unknown; distance?: (n: number) => unknown } | undefined;
  cameraPosition: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    transitionMs?: number,
  ) => void;
};

export type BrainNode = { slug: string; title: string; kind: string };
export type BrainEdge = { from: string; to: string; kind: string };

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as unknown as React.ComponentType<Record<string, unknown>>;

type Props = {
  nodes: BrainNode[];
  edges: BrainEdge[];
  /** Currently selected slug — selected node + its neighbors emphasize; the rest dim. */
  selectedSlug?: string | null;
  /** Fired when a node is clicked. Camera zoom still runs regardless. */
  onSelectNode?: (slug: string, kind: string) => void;
};

type GNode = BrainNode & {
  id: string;
  label: string;
  color: string;
  size: number;
  selected: boolean;
  isNeighbor: boolean;
  dim: boolean;
  fx?: number;
  fy?: number;
  fz?: number;
};
type GLink = {
  source: string;
  target: string;
  kind: string;
  connected: boolean;
  dim: boolean;
};

const SHELL_R = {
  document: 60,
  tag: 110,
  other: 150,
} as const;

const COLORS = {
  document: '#818cf8',
  tag: '#fbbf24',
  other: '#a1a1aa',
} as const;

function fibonacciSphere(n: number, radius: number, seed = 0): { x: number; y: number; z: number }[] {
  if (n === 0) return [];
  const golden = Math.PI * (1 + Math.sqrt(5));
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const phi = Math.acos(1 - 2 * t);
    const theta = golden * (i + 0.5) + seed;
    out.push({
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi),
    });
  }
  return out;
}

function colorFor(kind: string): string {
  if (kind === 'document') return COLORS.document;
  if (kind === 'tag') return COLORS.tag;
  return COLORS.other;
}

function sizeFor(kind: string): number {
  if (kind === 'document') return 6;
  if (kind === 'tag') return 5;
  return 4;
}

function truncate(s: string, max = 28): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

type LabelState = 'default' | 'emphasized' | 'dim';

function makeLabelSprite(text: string, state: LabelState, accentColor?: string): THREE.Sprite {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const emph = state === 'emphasized';
  const fontPx = emph ? 22 : 13;
  const padX = emph ? 10 : 4;
  const padY = emph ? 6 : 2;
  const fontWeight = emph ? 600 : 500;
  const scaledFont = fontPx * dpr;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontWeight} ${scaledFont}px ui-monospace, SFMono-Regular, monospace`;
  const measured = Math.ceil(ctx.measureText(text).width);
  const cw = measured + padX * 2 * dpr;
  const ch = Math.ceil(scaledFont) + padY * 2 * dpr;
  canvas.width = cw;
  canvas.height = ch;
  // Font must be re-applied after canvas resize.
  ctx.font = `${fontWeight} ${scaledFont}px ui-monospace, SFMono-Regular, monospace`;
  ctx.textBaseline = 'middle';

  if (emph) {
    const r = 6 * dpr;
    ctx.fillStyle = 'rgba(9,9,11,0.92)';
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(cw - r, 0);
    ctx.quadraticCurveTo(cw, 0, cw, r);
    ctx.lineTo(cw, ch - r);
    ctx.quadraticCurveTo(cw, ch, cw - r, ch);
    ctx.lineTo(r, ch);
    ctx.quadraticCurveTo(0, ch, 0, ch - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = accentColor ?? 'rgba(82,82,91,0.95)';
    ctx.stroke();
  }

  ctx.fillStyle = emph ? '#fafafa' : state === 'dim' ? '#71717a' : '#d4d4d8';
  ctx.fillText(text, padX * dpr, ch / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  const opacity = state === 'dim' ? 0.45 : emph ? 1 : 0.78;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity,
  });
  const sprite = new THREE.Sprite(mat);
  // Render after the sphere pass so labels always sit on top, even when the
  // camera angle would otherwise put them behind a node.
  sprite.renderOrder = 10;

  const worldHeight = emph ? 8 : 4.5;
  const aspect = cw / ch;
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  return sprite;
}

export function FullGbrainGraph({ nodes, edges, selectedSlug, onSelectNode }: Props) {
  const fgRef = useRef<ForceGraphHandle | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<GNode | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const docs = nodes.filter((n) => n.kind === 'document');
    const tags = nodes.filter((n) => n.kind === 'tag');
    const others = nodes.filter((n) => n.kind !== 'document' && n.kind !== 'tag');

    const docPos = fibonacciSphere(docs.length, SHELL_R.document, 0);
    const tagPos = fibonacciSphere(tags.length, SHELL_R.tag, 0.7);
    const otherPos = fibonacciSphere(others.length, SHELL_R.other, 1.4);

    const neighborIds = new Set<string>();
    if (selectedSlug) {
      for (const e of edges) {
        if (e.from === selectedSlug) neighborIds.add(e.to);
        if (e.to === selectedSlug) neighborIds.add(e.from);
      }
    }

    const make = (n: BrainNode, p: { x: number; y: number; z: number }): GNode => {
      const isSelected = !!selectedSlug && n.slug === selectedSlug;
      const isNeighbor = neighborIds.has(n.slug);
      return {
        ...n,
        id: n.slug,
        label: n.title || n.slug,
        color: colorFor(n.kind),
        size: sizeFor(n.kind),
        selected: isSelected,
        isNeighbor,
        dim: !!selectedSlug && !isSelected && !isNeighbor,
        fx: p.x,
        fy: p.y,
        fz: p.z,
      };
    };

    const gnodes: GNode[] = [
      ...docs.map((n, i) => make(n, docPos[i])),
      ...tags.map((n, i) => make(n, tagPos[i])),
      ...others.map((n, i) => make(n, otherPos[i])),
    ];

    const ids = new Set(gnodes.map((n) => n.id));
    const glinks: GLink[] = edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => {
        const connected = !!selectedSlug && (e.from === selectedSlug || e.to === selectedSlug);
        return {
          source: e.from,
          target: e.to,
          kind: e.kind,
          connected,
          dim: !!selectedSlug && !connected,
        };
      });

    return { nodes: gnodes, links: glinks };
  }, [nodes, edges, selectedSlug]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength?.(-120);
    fg.d3Force('link')?.distance?.(36);
  }, [data]);

  // Zoom whenever the selected slug changes (graph click, chat citation, or
  // file-row tag pill). Reads fx/fy/fz off the GNode since the fibonacci
  // layout pins each node to a fixed shell position.
  useEffect(() => {
    if (!selectedSlug) return;
    const fg = fgRef.current;
    if (!fg) return;
    const node = data.nodes.find((n) => n.id === selectedSlug);
    if (!node) return;
    const x = node.fx ?? 0;
    const y = node.fy ?? 0;
    const z = node.fz ?? 0;
    const r = Math.hypot(x, y, z) || 1;
    const distance = 80;
    fg.cameraPosition(
      { x: x * (1 + distance / r), y: y * (1 + distance / r), z: z * (1 + distance / r) },
      { x, y, z },
      900,
    );
  }, [selectedSlug, data]);

  return (
    <div
      ref={wrapRef}
      className="w-full h-full relative bg-zinc-950"
      style={{
        background:
          'radial-gradient(ellipse at center, #0b0b12 0%, #050507 70%, #000 100%)',
      }}
    >
      {size.w > 0 && size.h > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          nodeLabel={() => ''}
          nodeThreeObject={(n: unknown) => {
            const node = n as GNode;
            const group = new THREE.Group();

            const isEmph = node.selected || node.isNeighbor;
            const sizeMul = node.selected ? 1.7 : node.isNeighbor ? 1.25 : 1;

            const geo = new THREE.SphereGeometry(node.size * sizeMul, 24, 24);
            const mat = new THREE.MeshStandardMaterial({
              color: node.color,
              emissive: node.color,
              emissiveIntensity: node.selected ? 1.4 : node.isNeighbor ? 0.85 : 0.45,
              roughness: 0.35,
              metalness: 0.15,
              transparent: node.dim,
              opacity: node.dim ? 0.28 : 1,
            });
            group.add(new THREE.Mesh(geo, mat));

            const glowMat = new THREE.MeshBasicMaterial({
              color: node.selected ? '#ffffff' : node.color,
              transparent: true,
              opacity: node.selected ? 0.28 : node.isNeighbor ? 0.18 : node.dim ? 0.04 : 0.1,
            });
            group.add(
              new THREE.Mesh(
                new THREE.SphereGeometry(
                  node.size * (node.selected ? 1.9 : node.isNeighbor ? 1.5 : 1.25),
                  16,
                  16,
                ),
                glowMat,
              ),
            );

            const labelState: LabelState = isEmph ? 'emphasized' : node.dim ? 'dim' : 'default';
            const sprite = makeLabelSprite(truncate(node.label), labelState, node.color);
            sprite.position.set(0, node.size * sizeMul + (isEmph ? 7 : 4.5), 0);
            group.add(sprite);

            return group;
          }}
          linkColor={(l: unknown) => {
            const link = l as GLink;
            if (link.connected) return 'rgba(251,191,36,0.9)';
            if (link.dim) return 'rgba(120,120,140,0.1)';
            return 'rgba(150,150,170,0.4)';
          }}
          linkWidth={(l: unknown) => ((l as GLink).connected ? 1.4 : 0.6)}
          linkOpacity={1}
          linkDirectionalParticles={(l: unknown) => ((l as GLink).connected ? 3 : 0)}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.6}
          linkDirectionalParticleColor={() => '#fde68a'}
          enableNodeDrag
          onNodeHover={(n: unknown) => setHovered((n as GNode | null) ?? null)}
          onNodeClick={(n: unknown) => {
            const node = n as GNode;
            onSelectNode?.(node.slug, node.kind);
            // Tag clicks update selectedSlug and zoom via the effect above.
            // Doc clicks don't, so handle the camera move inline.
            if (node.kind === 'tag') return;
            const fg = fgRef.current;
            if (!fg) return;
            const distance = 80;
            const obj = node as unknown as { x?: number; y?: number; z?: number };
            const x = obj.x ?? 0;
            const y = obj.y ?? 0;
            const z = obj.z ?? 0;
            const r = Math.hypot(x, y, z) || 1;
            fg.cameraPosition(
              { x: x * (1 + distance / r), y: y * (1 + distance / r), z: z * (1 + distance / r) },
              { x, y, z },
              900,
            );
          }}
        />
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-0.5 rounded border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-[10px] font-mono text-zinc-300">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.document }} />
          <span>file</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.tag }} />
          <span>tag</span>
        </div>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute top-2 left-2 flex items-center gap-2 text-[11px] font-mono text-zinc-200 bg-zinc-950/85 border border-zinc-800 px-2 py-1 rounded max-w-[60%]">
          <span style={{ color: hovered.color }}>●</span>
          <span className="truncate">{hovered.label}</span>
          <span className="text-zinc-500 uppercase text-[9px] tracking-wide">{hovered.kind}</span>
        </div>
      )}
    </div>
  );
}
