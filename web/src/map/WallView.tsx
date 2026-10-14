// Cut-away wall pieces: beige faces with a darker cut top; glazing is translucent with mullions or blinds.
import { memo } from 'react';
import { type Box3, EYE, boxFaces, project, toPath } from '../iso/projection';
import type { WallPiece } from '../office/walls';
import { shade } from '../iso/color';
import { PAL } from './palette';

/** The x of a y-wall's face toward the camera (walls left of the camera show their right-hand face). */
const nearX = (b: Box3) => (EYE.x > b.x + b.w ? b.x + b.w : b.x);

function glassLines(p: WallPiece): string {
  const b = p.box;
  const fx = nearX(b);
  const long = p.axis === 'x' ? b.w : b.d;
  const count = Math.max(1, Math.round(long / 1.6));
  const lines: string[] = [];
  for (let i = 1; i < count; i += 1) {
    const t = (long * i) / count;
    const pt = (z: number) => (p.axis === 'x' ? project({ x: b.x + t, y: b.y, z }) : project({ x: fx, y: b.y + t, z }));
    lines.push(toPath([pt(b.z), pt(b.z + b.h)], false));
  }
  if (p.kind === 'blinds') {
    for (let z = b.z + 0.25; z < b.z + b.h - 0.05; z += 0.22) {
      const a = project({ x: p.axis === 'x' ? b.x : fx, y: b.y, z });
      const c = p.axis === 'x' ? project({ x: b.x + b.w, y: b.y, z }) : project({ x: fx, y: b.y + b.d, z });
      lines.push(toPath([a, c], false));
    }
  }
  return lines.join('');
}

/** A closed door: a wood (or painted) leaf in the wall line, with a frame line and a knob on the camera side. */
function DoorView({ piece }: { piece: WallPiece }) {
  const f = boxFaces(piece.box);
  const b = piece.box;
  const leaf = piece.color ?? PAL.door;
  const along = piece.axis === 'x';
  const fx = nearX(b);
  const face = (u: number, z: number) => (along ? project({ x: b.x + u, y: b.y, z }) : project({ x: fx, y: b.y + u, z }));
  const len = along ? b.w : b.d;
  const frame = toPath([face(0.08, 0), face(0.08, b.h - 0.1), face(len - 0.08, b.h - 0.1), face(len - 0.08, 0)], false);
  const knob = face(len - 0.3, 1.05);
  return (
    <g className="wall door">
      <path d={toPath(f.left)} fill={along ? shade(leaf, -0.2) : leaf} stroke="rgba(70,45,25,0.35)" strokeWidth={0.4} />
      <path d={toPath(f.right)} fill={along ? leaf : shade(leaf, -0.2)} stroke="rgba(70,45,25,0.35)" strokeWidth={0.4} />
      <path d={frame} fill="none" stroke={shade(leaf, -0.28)} strokeWidth={0.7} />
      <circle cx={knob.x} cy={knob.y} r={1.1} fill="#d9c27a" />
      <path d={toPath(f.top)} fill={PAL.wallCut} stroke={PAL.wallStroke} strokeWidth={0.6} strokeLinejoin="round" />
    </g>
  );
}

export const WallView = memo(function WallView({ piece }: { piece: WallPiece }) {
  if (piece.kind === 'door') return <DoorView piece={piece} />;
  const f = boxFaces(piece.box);
  if (piece.kind === 'glass' || piece.kind === 'blinds') {
    return (
      <g className={piece.exterior ? 'wall glass is-exterior' : 'wall glass'}>
        <path className="pane" d={toPath(f.left)} fill={PAL.glass} opacity={0.4} />
        <path className="pane" d={toPath(f.right)} fill={PAL.glass} opacity={0.45} />
        <path d={glassLines(piece)} stroke={piece.kind === 'blinds' ? '#f3efe6' : '#7f98a6'} strokeWidth={piece.kind === 'blinds' ? 0.9 : 0.7} fill="none" opacity={0.9} />
        <path d={toPath(f.top)} fill={PAL.glassTop} stroke="#6f8c9b" strokeWidth={0.6} />
      </g>
    );
  }
  const base = piece.color ?? PAL.wall;
  const side = piece.exterior ? shade(base, -0.03) : base;
  return (
    <g className="wall">
      <path d={toPath(f.left)} fill={side} stroke="rgba(90,75,55,0.18)" strokeWidth={0.4} />
      <path d={toPath(f.right)} fill={shade(side, -0.09)} stroke="rgba(90,75,55,0.18)" strokeWidth={0.4} />
      <path d={toPath(f.top)} fill={PAL.wallCut} stroke={PAL.wallStroke} strokeWidth={0.6} strokeLinejoin="round" />
    </g>
  );
});
