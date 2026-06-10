"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Inline control row shown in selected mode. Stops click propagation so
 *  operating a control doesn't re-trigger card selection / canvas handlers. */
export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="mt-2 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="ml-auto flex items-center gap-0.5">{children}</div>
    </div>
  );
}

export function CtlButton({ className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 ${className}`}
      {...rest}
    />
  );
}
