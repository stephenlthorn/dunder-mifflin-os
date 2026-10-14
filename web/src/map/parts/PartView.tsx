import { memo } from 'react';
import { faceColors, mix } from '../../iso/color';
import { ELLIPSE_RY, UNIT_PX, boxFaces, project, scaleAt, toPath } from '../../iso/projection';
import { arcFaces } from './arcFaces';
import { decalVisible } from './decalFaces';
import { type ArcPart, type Decal, type Part, type TextDecal, partBox } from './parts';

const f = (v: number) => Number(v.toFixed(2));
const TEXT_K = 10; // draw text 10× larger in a 10× smaller frame, so tiny world-unit font sizes stay crisp

/** Text lying on a vertical face: its baseline follows the world axis, its "down" follows −z. */
function TextView({ d }: { d: TextDecal }) {
  const o = project(d.at);
  const u = project(d.axis === 'x' ? { ...d.at, x: d.at.x + 1 } : { ...d.at, y: d.at.y + 1 });
  const v = project({ ...d.at, z: (d.at.z ?? 0) - 1 });
  const m = [u.x - o.x, u.y - o.y, v.x - o.x, v.y - o.y].map((n) => f(n / TEXT_K));
  return (
    <text transform={`matrix(${m.join(' ')} ${f(o.x)} ${f(o.y)})`} fontSize={d.size * TEXT_K} fontWeight={d.weight ?? 700} fill={d.fill}
      textAnchor={d.anchor ?? 'start'} fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif" letterSpacing={d.size * 0.6}>
      {d.text}
    </text>
  );
}

function ArcBody({ p }: { p: ArcPart }) {
  const c = faceColors(p.side, p.top);
  return (
    <>
      {arcFaces(p).map((face, i) => (
        <path key={i} d={toPath(face.points.map(project))} fill={face.face === 'top' ? c.top : mix(c.left, c.right, face.tone)}
          stroke="rgba(40,30,20,0.18)" strokeWidth={face.face === 'top' ? 0.4 : 0.25} strokeLinejoin="round" />
      ))}
    </>
  );
}

function DecalView({ d }: { d: Decal }) {
  if (d.kind === 'text') return <TextView d={d} />;
  if (d.kind === 'poly') {
    return <path d={toPath(d.points.map(project))} fill={d.fill} stroke={d.stroke} strokeWidth={d.stroke ? 0.5 : undefined} opacity={d.opacity} />;
  }
  const path = d.segments.map(([a, b]) => toPath([project(a), project(b)], false)).join('');
  return <path d={path} stroke={d.stroke} strokeWidth={d.width ?? 0.6} opacity={d.opacity} fill="none" strokeLinecap="round" />;
}

function Body({ p }: { p: Part }) {
  if (p.shape === 'arc') return <ArcBody p={p} />;
  if (p.shape === 'box') {
    const faces = boxFaces(p.box);
    const c = faceColors(p.side, p.top);
    const stroke = p.stroke ?? 'rgba(40,30,20,0.18)';
    return (
      <>
        {faces.left.length > 0 && <path d={toPath(faces.left)} fill={c.left} stroke={stroke} strokeWidth={0.4} strokeLinejoin="round" />}
        {faces.right.length > 0 && <path d={toPath(faces.right)} fill={c.right} stroke={stroke} strokeWidth={0.4} strokeLinejoin="round" />}
        <path d={toPath(faces.top)} fill={c.top} stroke={stroke} strokeWidth={0.4} strokeLinejoin="round" />
      </>
    );
  }
  if (p.shape === 'cyl') {
    const top = project({ x: p.cx, y: p.cy, z: p.z + p.h });
    const bot = project({ x: p.cx, y: p.cy, z: p.z });
    const k = scaleAt({ x: p.cx, y: p.cy, z: p.z });
    const rx = p.r * UNIT_PX * k;
    const ry = p.r * ELLIPSE_RY * k;
    const c = faceColors(p.side, p.top);
    const side = `M${f(bot.x - rx)} ${f(top.y)}L${f(bot.x - rx)} ${f(bot.y)}A${f(rx)} ${f(ry)} 0 0 0 ${f(bot.x + rx)} ${f(bot.y)}L${f(bot.x + rx)} ${f(top.y)}Z`;
    const shadeHalf = `M${f(bot.x)} ${f(top.y)}L${f(bot.x)} ${f(bot.y + ry)}A${f(rx)} ${f(ry)} 0 0 0 ${f(bot.x + rx)} ${f(bot.y)}L${f(bot.x + rx)} ${f(top.y)}Z`;
    return (
      <>
        <path d={side} fill={c.left} />
        <path d={shadeHalf} fill={c.right} opacity={0.55} />
        <ellipse cx={f(top.x)} cy={f(top.y)} rx={f(rx)} ry={f(ry)} fill={c.top} stroke="rgba(40,30,20,0.15)" strokeWidth={0.4} />
      </>
    );
  }
  const c = project({ x: p.cx, y: p.cy, z: p.z });
  const r = p.r * UNIT_PX * 0.92 * scaleAt({ x: p.cx, y: p.cy, z: p.z });
  return (
    <>
      <circle cx={f(c.x)} cy={f(c.y)} r={f(r)} fill={p.fill} />
      <circle cx={f(c.x - r * 0.3)} cy={f(c.y - r * 0.35)} r={f(r * 0.45)} fill="#ffffff" opacity={0.16} />
    </>
  );
}

export const PartView = memo(function PartView({ part }: { part: Part }) {
  const b = partBox(part);
  const decals = part.decals?.map((d, i) => (decalVisible(b, d) ? <DecalView key={i} d={d} /> : null));
  if (part.shape === 'box' && part.clipDecals === 'top') {
    const id = `clip-${part.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
    return (
      <g opacity={part.opacity} className={part.className}>
        <clipPath id={id}><path d={toPath(boxFaces(part.box).top)} /></clipPath>
        <Body p={part} />
        <g clipPath={`url(#${id})`}>{decals}</g>
      </g>
    );
  }
  return (
    <g opacity={part.opacity} className={part.className}>
      <Body p={part} />
      {decals}
    </g>
  );
});
