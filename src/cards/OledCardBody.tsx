"use client";

import { Expand } from "lucide-react";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";
import { ControlRow, CtlButton } from "./CardControls";

// Deterministic little bar-graph row, mimicking a rendered display widget.
const BARS = [4, 6, 5, 8, 7, 10, 9, 12, 10, 13, 11, 14];

type OledCardBodyProps = {
  state: PeripheralState | null;
  selected: boolean;
  onInteract: (interaction: PeripheralInteraction) => void;
};

export function OledCardBody({ state, selected }: OledCardBodyProps) {
  const oled = state?.kind === "oled" ? state : null;
  const lines = oled?.textFallback ?? [];
  const on = Boolean(oled);

  return (
    <div className="flex flex-col items-center">
      {/* Preview: the display itself is the primary live element */}
      <div className="w-full overflow-hidden rounded-md bg-slate-950 p-2 font-mono text-[10px] leading-snug shadow-inner ring-1 ring-black/50">
        {on ? (
          <>
            {lines.slice(0, 2).map((line, i) => (
              <div key={i} className="truncate text-slate-100">{line}</div>
            ))}
            <div className="mt-1 flex h-4 items-end gap-[2px]" aria-hidden>
              {BARS.map((h, i) => (
                <span key={i} className="w-[3px] rounded-[1px] bg-slate-100/80" style={{ height: `${h}px` }} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[40px] items-center justify-center text-slate-600">display off</div>
        )}
      </div>

      <h3 className="mt-1.5 text-sm font-semibold leading-tight text-slate-900">OLED</h3>
      <p className="text-[11px] text-slate-400">{oled ? `${oled.width}×${oled.height} · I2C` : "SSD1306 · I2C"}</p>

      {selected ? (
        <div className="w-full">
          <ControlRow label="Display">
            <CtlButton className="flex items-center gap-1 text-slate-400" disabled title="Larger preview coming with real Renode framebuffer">
              <Expand className="size-3" aria-hidden /> Open Preview
            </CtlButton>
          </ControlRow>
        </div>
      ) : null}
    </div>
  );
}
