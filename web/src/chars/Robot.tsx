// Jarvis: a friendly desk robot instead of a person.
import type { Look } from '@shared/contract';
import { shade } from '../iso/color';

export function RobotFront({ look }: { look: Look }) {
  const shell = look.skin;
  const accent = look.hair;
  const body = look.shirt;
  return (
    <g>
      <path d="M-5 0L5 0L6 5L3 6Z" fill="#6d7680" />
      <rect x={-6.5} y={-14} width={13} height={14} rx={3.5} fill={body} />
      <rect x={-3.6} y={-11} width={7.2} height={6} rx={1.5} fill={shade(body, -0.25)} />
      <circle cx={0} cy={-8} r={1.6} fill={accent} className="robot-light" />
      <path d="M-6.8 -11L-6.4 -4L-1 -3" stroke="#9aa4ae" strokeWidth={3} strokeLinecap="round" fill="none" />
      <path d="M6.8 -11L8 -4.5L10.5 -3.6" stroke="#8a949e" strokeWidth={3} strokeLinecap="round" fill="none" />
      <circle cx={-0.8} cy={-3} r={1.7} fill="#c9d1d9" />
      <circle cx={10.7} cy={-3.6} r={1.7} fill="#c9d1d9" />
      <rect x={-1} y={-17} width={3} height={3.5} fill="#8a949e" />
      <path d="M1 -31L1 -35.5" stroke="#8a949e" strokeWidth={1} />
      <circle cx={1} cy={-36.2} r={1.7} fill={accent} className="robot-light" />
      <rect x={-8} y={-31} width={18} height={15.5} rx={5} fill={shell} stroke={shade(shell, -0.22)} strokeWidth={0.7} />
      <circle cx={-8.2} cy={-23} r={2.2} fill={shade(shell, -0.2)} />
      <rect x={-4.6} y={-27} width={13} height={8} rx={3.4} fill="#1f2a36" />
      <path d="M-2.6 -23q1.3 -1.8 2.6 0M3.6 -23q1.3 -1.8 2.6 0" stroke={accent} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <path d="M0.4 -20.8q1.9 1.3 3.8 0" stroke={accent} strokeWidth={0.9} fill="none" strokeLinecap="round" />
    </g>
  );
}

export function RobotBack({ look }: { look: Look }) {
  return (
    <g>
      <rect x={-6.5} y={-14} width={13} height={14} rx={3.5} fill={look.shirt} />
      <rect x={-2.6} y={-11} width={5.2} height={7} rx={1} fill={shade(look.shirt, -0.2)} />
      <rect x={-2} y={-17} width={3} height={3.5} fill="#8a949e" />
      <path d="M-1 -31L-1 -35.5" stroke="#8a949e" strokeWidth={1} />
      <circle cx={-1} cy={-36.2} r={1.7} fill={look.hair} className="robot-light" />
      <rect x={-10} y={-31} width={18} height={15.5} rx={5} fill={look.skin} stroke={shade(look.skin, -0.22)} strokeWidth={0.7} />
      <circle cx={8.2} cy={-23} r={2.2} fill={shade(look.skin, -0.2)} />
    </g>
  );
}
