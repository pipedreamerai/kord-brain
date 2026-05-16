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
};

type GNode = BrainNode & {
  id: string;
  label: string;
  color: string;
  size: number;
  fx?: number;
  fy?: number;
  fz?: number;
};
type GLink = { source: string; target: string; kind: string };

const BRAIN_ID = '__brain__';

const SHELL_R = {
  document: 60,
  tag: 110,
  other: 150,
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

const COLORS = {
  document: '#818cf8',
  tag: '#fbbf24',
  root: '#10b981',
  other: '#a1a1aa',
} as const;

function colorFor(kind: string): string {
  if (kind === 'document') return COLORS.document;
  if (kind === 'tag') return COLORS.tag;
  if (kind === 'root') return COLORS.root;
  return COLORS.other;
}

function sizeFor(kind: string): number {
  if (kind === 'root') return 9;
  if (kind === 'document') return 6;
  if (kind === 'tag') return 5;
  return 4;
}

export function FullGbrainGraph({ nodes, edges }: Props) {
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

    const make = (n: BrainNode, p: { x: number; y: number; z: number }): GNode => ({
      ...n,
      id: n.slug,
      label: n.title || n.slug,
      color: colorFor(n.kind),
      size: sizeFor(n.kind),
      fx: p.x,
      fy: p.y,
      fz: p.z,
    });

    const gnodes: GNode[] = [
      ...docs.map((n, i) => make(n, docPos[i])),
      ...tags.map((n, i) => make(n, tagPos[i])),
      ...others.map((n, i) => make(n, otherPos[i])),
    ];

    const ids = new Set(gnodes.map((n) => n.id));
    const glinks: GLink[] = edges
      .filter((e) => ids.has(e.from) && ids.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind }));

    if (gnodes.length > 0) {
      gnodes.push({
        slug: BRAIN_ID,
        title: 'brain',
        kind: 'root',
        id: BRAIN_ID,
        label: 'brain',
        color: colorFor('root'),
        size: sizeFor('root'),
        fx: 0,
        fy: 0,
        fz: 0,
      });
      for (const n of docs) {
        glinks.push({ source: BRAIN_ID, target: n.slug, kind: 'root' });
      }
    }

    return { nodes: gnodes, links: glinks };
  }, [nodes, edges]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength?.(-120);
    fg.d3Force('link')?.distance?.(36);
  }, [data]);

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
          nodeLabel={(n: unknown) => {
            const node = n as GNode;
            return `<div style="
              font: 500 11px ui-monospace, SFMono-Regular, monospace;
              color: #e4e4e7;
              background: rgba(9,9,11,0.92);
              border: 1px solid #27272a;
              padding: 4px 8px;
              border-radius: 4px;
              max-width: 260px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">
              <span style="color:${node.color}">●</span> ${escapeHtml(node.label)}
              <div style="color:#71717a;font-size:10px;margin-top:2px">${node.kind}</div>
            </div>`;
          }}
          nodeThreeObject={(n: unknown) => {
            const node = n as GNode;
            const isBrain = node.id === BRAIN_ID;
            const group = new THREE.Group();
            const geo = new THREE.SphereGeometry(node.size, 24, 24);
            const mat = new THREE.MeshStandardMaterial({
              color: node.color,
              emissive: node.color,
              emissiveIntensity: isBrain ? 0.9 : 0.45,
              roughness: 0.35,
              metalness: 0.15,
            });
            const mesh = new THREE.Mesh(geo, mat);
            group.add(mesh);

            const glowMat = new THREE.MeshBasicMaterial({
              color: node.color,
              transparent: true,
              opacity: isBrain ? 0.32 : 0.18,
            });
            const glow = new THREE.Mesh(
              new THREE.SphereGeometry(node.size * (isBrain ? 2.4 : 1.8), 16, 16),
              glowMat,
            );
            group.add(glow);

            if (isBrain) {
              const outerGlow = new THREE.Mesh(
                new THREE.SphereGeometry(node.size * 4, 16, 16),
                new THREE.MeshBasicMaterial({
                  color: node.color,
                  transparent: true,
                  opacity: 0.07,
                }),
              );
              group.add(outerGlow);
            }

            return group;
          }}
          linkColor={() => 'rgba(120,120,140,0.35)'}
          linkWidth={0.6}
          linkOpacity={0.5}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.4}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleColor={(l: unknown) => {
            const link = l as GLink;
            const targetId =
              typeof link.target === 'string'
                ? link.target
                : (link.target as { id?: string })?.id ?? '';
            const node = data.nodes.find((n) => n.id === targetId);
            return node?.color ?? '#10b981';
          }}
          enableNodeDrag
          onNodeHover={(n: unknown) => setHovered((n as GNode | null) ?? null)}
          onNodeClick={(n: unknown) => {
            const node = n as GNode;
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
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: COLORS.root }} />
          <span>brain</span>
        </div>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute top-2 left-2 text-[11px] font-mono text-zinc-300 bg-zinc-950/80 border border-zinc-800 px-2 py-1 rounded max-w-[60%] truncate">
          <span style={{ color: hovered.color }}>●</span> {hovered.label}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
