// "Show on the map": glide the camera to a person or a room's area, then focus them (which shows the tooltip).
import { type RefObject, useEffect } from 'react';
import type { Placement } from '../office/placement';
import { areaFrame, personFocusPoint } from './mapTargets';
import { targetElement } from './useMapKeys';
import type { CameraTarget, FlyOptions } from './usePanZoom';
import { centerOn, fitView } from './viewport';

export type MapFocusTarget = { kind: 'person' | 'area'; id: string };
export type FocusRequest = { target: MapFocusTarget; seq: number };

const PERSON_ZOOM = 2.2;
const AREA_MAX_ZOOM = 2.6;

export function cameraTargetFor(target: MapFocusTarget, placements: readonly Placement[]): CameraTarget | null {
  if (target.kind === 'person') {
    const pt = personFocusPoint(placements, target.id);
    return pt ? (size, from) => centerOn(pt, Math.max(from.scale, PERSON_ZOOM), size) : null;
  }
  const frame = areaFrame(target.id);
  if (!frame) return null;
  return (size) => {
    const fitted = fitView(frame, size, 56);
    return fitted.scale > AREA_MAX_ZOOM ? centerOn({ x: (frame.minX + frame.maxX) / 2, y: (frame.minY + frame.maxY) / 2 }, AREA_MAX_ZOOM, size) : fitted;
  };
}

type Args = {
  request: FocusRequest | null;
  placements: readonly Placement[];
  root: RefObject<SVGSVGElement | null>;
  flyTo: (target: CameraTarget, opts?: FlyOptions) => void;
  instant: boolean;
  beforeFly: () => void;
};

export function useMapFocus({ request, placements, root, flyTo, instant, beforeFly }: Args) {
  useEffect(() => {
    if (!request) return;
    const camera = cameraTargetFor(request.target, placements);
    if (!camera) return;
    beforeFly();
    const key = `${request.target.kind}:${request.target.id}`;
    flyTo(camera, { instant, onDone: () => targetElement(root.current, key)?.focus({ preventScroll: true }) });
    // only a new request moves the camera, not later snapshots
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
}
