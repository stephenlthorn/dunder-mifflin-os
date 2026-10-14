// Ground layer: building slabs, floor finishes, rugs/mats/floor marks, soft contact shadows and the stair link.
import { memo } from 'react';
import { type Area, type OfficeData, type Rect, areaRects } from '@shared/office';
import { boxFaces, project, rectPath, toPath } from '../iso/projection';
import { flatFurniture } from '../office/scene';
import type { Drawable } from '../office/scene';
import { checkerPath, floorStyle, plankPath, seamPath } from './floorPattern';
import { PAL } from './palette';

type Props = { office: OfficeData; scene: readonly Drawable[]; clickableAreas: ReadonlySet<string>; onArea: (areaId: string) => void };

function Slab({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  const f = boxFaces({ x, y, z: -0.9, w, d, h: 0.9 });
  return (
    <g>
      <path d={toPath(f.left)} fill={PAL.slab} />
      <path d={toPath(f.right)} fill={PAL.slabSide} />
    </g>
  );
}

function AreaFloor({ area, r, clickable, onArea }: { area: Area; r: Rect; clickable: boolean; onArea: (id: string) => void }) {
  const s = floorStyle(area.floor);
  const pattern = s.checker ? checkerPath(r, s.tileW) : s.planks ? plankPath(r, s.tileW, s.tileD) : seamPath(r, s.tileW, s.tileD);
  return (
    <g
      className={clickable ? 'area-floor is-clickable' : 'area-floor'}
      data-area={area.id}
      onClick={clickable ? () => onArea(area.id) : undefined}
    >
      <path d={rectPath(r.x, r.y, r.w, r.h)} fill={s.base} />
      {s.checker
        ? <path d={pattern} fill={s.checker} opacity={0.9} />
        : <path d={pattern} stroke={s.seam} strokeWidth={0.6} fill="none" opacity={0.75} />}
    </g>
  );
}

function shadowPath(d: Drawable): string {
  const pad = d.type === 'wall' ? 0.18 : 0.12;
  const b = d.box;
  return toPath([
    project({ x: b.x - pad, y: b.y - pad }), project({ x: b.x + b.w + pad, y: b.y - pad }),
    project({ x: b.x + b.w + pad, y: b.y + b.d + pad }), project({ x: b.x - pad, y: b.y + b.d + pad }),
  ]);
}

export const Floors = memo(function Floors({ office, scene, clickableAreas, onArea }: Props) {
  const main = office.areas.filter((a) => a.level === 'main');
  const lower = office.areas.filter((a) => a.level !== 'main');
  const { from, to } = office.stairLink;
  const a = project(from);
  const b = project(to);
  const flats = flatFurniture(office);
  const solid = scene.filter((d) => d.type !== 'furniture' || d.box.z === 0);
  const bend = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.25, y: (a.y + b.y) / 2 - (b.x - a.x) * 0.25 };
  return (
    <g className="floors">
      {[...main, ...lower].flatMap((area) => areaRects(area).map((r, i) => (
        <Slab key={`slab-${area.id}-${i}`} x={r.x - 0.2} y={r.y - 0.2} w={r.w + 0.4} d={r.h + 0.4} />
      )))}
      {[...main, ...lower].flatMap((area) => areaRects(area).map((r, i) => (
        <AreaFloor key={`${area.id}-${i}`} area={area} r={r} clickable={clickableAreas.has(area.id)} onArea={onArea} />
      )))}
      {flats.map((f) => (
        <path
          key={f.id}
          d={rectPath(f.x, f.y, f.w, f.d)}
          fill={f.color ?? '#b49a74'}
          opacity={f.kind === 'rug' ? 0.55 : 0.9}
          stroke={f.kind === 'rug' ? '#ffffff' : undefined}
          strokeOpacity={0.35}
          strokeWidth={f.kind === 'rug' ? 1.2 : undefined}
        />
      ))}
      <g filter="url(#dm-soft)" opacity={0.22}>
        {solid.map((d) => <path key={`sh-${d.id}`} d={shadowPath(d)} fill={PAL.shadow} />)}
      </g>
      <path
        d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${bend.x.toFixed(1)} ${bend.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
        stroke="#8a7f70"
        strokeWidth={2}
        strokeDasharray="5 5"
        fill="none"
        markerEnd="url(#dm-arrow)"
        opacity={0.8}
      />
    </g>
  );
});
