"use client";

import { motion } from "motion/react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

type ButtonCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function ButtonCardBody({ state, selected, onInteract }: ButtonCardBodyProps) {
  const btn = state?.kind === "button" ? state : null;
  const pressed = Boolean(btn?.pressed);
  const locked = Boolean(btn?.locked);
  const heldMs = btn?.heldMs;
  const liveText = btn
    ? pressed
      ? heldMs && heldMs > 250
        ? `held · ${(heldMs / 1000).toFixed(1)}s`
        : "pressed"
      : "released"
    : null;

  const press = () => onInteract({ kind: "button", action: "press" });
  const release = () => onInteract({ kind: "button", action: "release" });

  return (
    <div className="flex flex-col items-center">
      {/* Preview: directly operable tactile button */}
      <div className="grid h-16 w-full place-items-center">
        <button
          type="button"
          aria-label={pressed ? "Release button" : "Press button"}
          onClick={(event) => event.stopPropagation()}
          onMouseDown={press}
          onMouseUp={release}
          onMouseLeave={(event) => {
            if (event.buttons === 0 && !locked) release();
          }}
          className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-slate-200 to-slate-300 p-1.5 shadow-inner ring-1 ring-slate-300/70"
        >
          <motion.span
            aria-hidden
            className="block size-9 rounded-full bg-gradient-to-b from-slate-600 to-slate-800"
            animate={
              pressed
                ? { y: 2, scale: 0.94, boxShadow: "inset 0 2px 4px rgba(0,0,0,0.45)" }
                : { y: 0, scale: 1, boxShadow: "0 2px 4px rgba(0,0,0,0.3)" }
            }
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
          />
        </button>
      </div>

      <h3 className="mt-0.5 text-sm font-semibold leading-tight text-slate-900">Button</h3>

      {liveText ? (
        <div className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <span className={`size-2 shrink-0 rounded-full ${pressed ? "bg-blue-500" : "bg-slate-400"}`} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{liveText}</span>
          {locked ? <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-500">lock</span> : null}
        </div>
      ) : null}

      {selected ? (
        <div className="w-full">
          <ControlRow label="Simulate">
            <CtlButton onMouseDown={press} onMouseUp={release}>Press</CtlButton>
            <CtlButton onClick={press}>Hold</CtlButton>
            <CtlButton className={locked ? "text-amber-600" : ""} onClick={() => onInteract({ kind: "button", action: "lockToggle" })}>Lock</CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
