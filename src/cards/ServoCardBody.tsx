"use client";

import { motion } from "motion/react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

const CX = 55;
const CY = 50;
const R = 42;

function point(angleDeg: number) {
  const theta = Math.PI * (1 - angleDeg / 180);
  return { x: CX + R * Math.cos(theta), y: CY - R * Math.sin(theta) };
}

function arcPath(toAngle: number) {
  const start = point(0);
  const end = point(Math.max(0, Math.min(180, toAngle)));
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${R} ${R} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

type ServoCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function ServoCardBody({ state, selected, onInteract }: ServoCardBodyProps) {
  const servo = state?.kind === "servo" ? state : null;
  const angle = servo ? servo.angleDeg : 90;
  const moving = Boolean(servo?.moving);
  const target = servo?.targetAngleDeg;
  const arm = point(angle);

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-16 w-full">
        <svg viewBox="0 0 110 56" className="h-full w-full" aria-hidden>
          <path d={arcPath(180)} fill="none" stroke="#e2e8f0" strokeWidth="7" strokeLinecap="round" />
          {servo ? <path d={arcPath(angle)} fill="none" stroke="#3b82f6" strokeWidth="7" strokeLinecap="round" /> : null}
          <motion.line
            x1={CX}
            y1={CY}
            x2={arm.x}
            y2={arm.y}
            stroke={servo ? "#475569" : "#cbd5e1"}
            strokeWidth="3"
            strokeLinecap="round"
            animate={{ x2: arm.x, y2: arm.y }}
            transition={moving ? { type: "spring", stiffness: 120, damping: 16 } : { duration: 0.15 }}
          />
          <circle cx={CX} cy={CY} r="4" fill={servo ? "#475569" : "#cbd5e1"} />
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-2xl font-bold tabular-nums leading-none text-slate-900">
          {servo ? `${Math.round(angle)}°` : "—°"}
        </div>
      </div>

      <h3 className="mt-1 text-sm font-semibold leading-tight text-slate-900">Servo</h3>
      {moving && target !== undefined ? (
        <p className="text-[11px] font-medium text-blue-500">moving → {Math.round(target)}°</p>
      ) : null}

      {selected ? (
        <div className="w-full">
          <ControlRow label="Angle">
            <CtlButton onClick={() => onInteract({ kind: "servo", action: "setAngle", angleDeg: Math.max(0, Math.round(angle) - 5) })}>−</CtlButton>
            <span className="min-w-[2.75rem] text-center text-[11px] font-semibold tabular-nums text-slate-700">{Math.round(angle)}°</span>
            <CtlButton onClick={() => onInteract({ kind: "servo", action: "setAngle", angleDeg: Math.min(180, Math.round(angle) + 5) })}>+</CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
