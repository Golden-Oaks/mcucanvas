"use client";

import { motion } from "motion/react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

const BLADES = [0, 60, 120, 180, 240, 300];

type MotorCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function MotorCardBody({ state, selected, onInteract }: MotorCardBodyProps) {
  const motor = state?.kind === "motor" ? state : null;
  const running = Boolean(motor?.running);
  const rpm = motor?.rpm ?? 0;
  const direction = motor?.direction ?? "cw";

  return (
    <div className="flex flex-col items-center">
      <div className="grid h-16 w-full place-items-center">
        <svg viewBox="0 0 64 64" className="size-16" aria-hidden>
          <defs>
            <radialGradient id="motorDisc" cx="38%" cy="34%" r="70%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="65%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </radialGradient>
          </defs>
          <circle cx="32" cy="32" r="29" fill="url(#motorDisc)" stroke="#94a3b8" strokeWidth="1.5" />
          <motion.g
            style={{ transformOrigin: "32px 32px" }}
            animate={running ? { rotate: direction === "cw" ? 360 : -360 } : { rotate: 0 }}
            transition={running ? { repeat: Infinity, ease: "linear", duration: 1.2 } : { duration: 0.3 }}
          >
            {BLADES.map((a) => (
              <rect key={a} x="30.5" y="7" width="3" height="17" rx="1.5" fill="#64748b" transform={`rotate(${a} 32 32)`} />
            ))}
          </motion.g>
          <circle cx="32" cy="32" r="6.5" fill="#475569" />
          <circle cx="32" cy="32" r="2.5" fill="#cbd5e1" />
        </svg>
      </div>

      <h3 className="mt-0.5 text-sm font-semibold leading-tight text-slate-900">Motor</h3>

      {motor ? (
        <p className="mt-0.5 text-center text-sm font-semibold tabular-nums leading-none text-slate-900">
          {rpm.toLocaleString()}
          <span className="ml-1 text-[11px] font-medium text-slate-500">rpm · {direction === "cw" ? "CW" : "CCW"}</span>
        </p>
      ) : null}

      {selected ? (
        <div className="w-full">
          <ControlRow label="Override">
            <CtlButton onClick={() => onInteract({ kind: "motor", action: "auto" })}>Auto</CtlButton>
            <CtlButton onClick={() => onInteract({ kind: "motor", action: "stop" })}>Stop</CtlButton>
            <CtlButton onClick={() => onInteract({ kind: "motor", action: "reverse" })}>Rev</CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
