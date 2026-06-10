"use client";

import { Thermometer } from "lucide-react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

const TREND_LABEL: Record<string, string> = { stable: "stable", rising: "rising ↑", falling: "falling ↓" };
const TREND_COLOR: Record<string, string> = {
  stable: "text-emerald-600",
  rising: "text-amber-600",
  falling: "text-blue-600",
};

type TempCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function TempCardBody({ state, selected, onInteract }: TempCardBodyProps) {
  const temp = state?.kind === "temp" ? state : null;
  const celsius = temp ? temp.celsius : null;
  const trend = temp?.trend ?? "stable";

  return (
    <div className="flex flex-col items-center">
      {/* Big value dominant, thermometer secondary */}
      <div className="flex h-16 w-full items-center justify-center gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <Thermometer className="size-6" aria-hidden />
        </span>
        <div className="flex items-baseline">
          <span className="text-3xl font-bold tabular-nums leading-none text-slate-900">
            {celsius !== null ? celsius.toFixed(1) : "—"}
          </span>
          <span className="ml-1 text-sm font-semibold text-slate-500">°C</span>
        </div>
      </div>

      <h3 className="mt-0.5 text-sm font-semibold leading-tight text-slate-900">Temp Sensor</h3>
      {temp ? (
        <p className={`flex items-center gap-1 text-[11px] font-medium ${TREND_COLOR[trend] ?? "text-slate-500"}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {TREND_LABEL[trend] ?? trend}
        </p>
      ) : null}

      {selected ? (
        <div className="w-full">
          <ControlRow label="Set">
            <CtlButton onClick={() => onInteract({ kind: "temp", action: "setCelsius", celsius: +((celsius ?? 24.8) - 0.5).toFixed(1) })}>−</CtlButton>
            <span className="min-w-[3.25rem] text-center text-[11px] font-semibold tabular-nums text-slate-700">{(celsius ?? 24.8).toFixed(1)} °C</span>
            <CtlButton onClick={() => onInteract({ kind: "temp", action: "setCelsius", celsius: +((celsius ?? 24.8) + 0.5).toFixed(1) })}>+</CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
