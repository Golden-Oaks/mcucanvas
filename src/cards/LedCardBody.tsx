"use client";

import { motion } from "motion/react";
import { AudioWaveform } from "lucide-react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

type LedCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function LedCardBody({ state, selected, onInteract }: LedCardBodyProps) {
  const led = state?.kind === "led" ? state : null;
  const mode = led?.mode ?? null;
  const lit = mode === "on" || (mode === "blinking" && Boolean(led?.value));
  const liveText =
    mode === "blinking"
      ? `blinking · ${led?.frequencyHz ?? 2} Hz`
      : mode === "on"
        ? "on"
        : mode === "pwm"
          ? `pwm · ${Math.round((led?.dutyCycle ?? 0) * 100)}%`
          : mode === "off"
            ? "off"
            : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid h-16 w-full place-items-center">
        <motion.div
          aria-hidden
          className="absolute size-16 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(250,204,21,0.75), rgba(250,204,21,0) 70%)" }}
          animate={{ opacity: lit ? 1 : 0.04, scale: lit ? 1 : 0.85 }}
          transition={{ duration: mode === "blinking" ? 0.12 : 0.25, ease: "easeOut" }}
        />
        <motion.span
          aria-hidden
          className="relative text-[2.75rem] leading-none"
          animate={{ opacity: lit ? 1 : 0.4, filter: lit ? "saturate(1.2)" : "saturate(0.2)" }}
          transition={{ duration: mode === "blinking" ? 0.12 : 0.25 }}
        >
          💡
        </motion.span>
      </div>

      <h3 className="mt-0.5 text-sm font-semibold leading-tight text-slate-900">LED</h3>

      {liveText ? (
        <div className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <span className={`size-2 shrink-0 rounded-full ${lit || mode === "blinking" ? "bg-emerald-500" : "bg-slate-400"}`} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{liveText}</span>
          {mode === "blinking" || mode === "pwm" ? <AudioWaveform className="size-3.5 shrink-0 text-blue-400" aria-hidden /> : null}
        </div>
      ) : null}

      {selected ? (
        <div className="w-full">
          <ControlRow label="Override">
            <CtlButton onClick={() => onInteract({ kind: "led", action: "auto" })}>Auto</CtlButton>
            <CtlButton onClick={() => onInteract({ kind: "led", action: "on" })}>On</CtlButton>
            <CtlButton onClick={() => onInteract({ kind: "led", action: "off" })}>Off</CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
