import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { McuCanvas, projectionFromMcuFiles } from "mcucanvas";
import type { CanvasProjection } from "mcucanvas";
import { sample } from "./sampleProject";

export function App() {
  const [source, setSource] = useState(() =>
    JSON.stringify(sample, null, 2),
  );
  const [projection, setProjection] = useState<CanvasProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGoodSourceRef = useRef(source);

  const computeProjection = useCallback(
    async (raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }

      const obj = parsed as Record<string, unknown>;
      const proj = await projectionFromMcuFiles({
        projectJson: obj.project,
        layoutJson: obj.layout,
      });

      setProjection(proj);
      setError(null);

      if (proj.status.level !== "ready" && proj.status.messages.length > 0) {
        setStatusMessages(proj.status.messages);
      } else {
        setStatusMessages([]);
      }
    },
    [],
  );

  // Compute projection on mount.
  useEffect(() => {
    computeProjection(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSourceChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setSource(next);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        lastGoodSourceRef.current = next;
        computeProjection(next);
      }, 300);
    },
    [computeProjection],
  );

  // Cleanup debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen">
      {/* Canvas region */}
      <div className="flex-1 relative">
        {projection ? (
          <McuCanvas projection={projection} />
        ) : error ? (
          <div className="flex h-full items-center justify-center text-red-500">
            <p>{error}</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <p>Loading projection…</p>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div
        className={`flex flex-col border-l border-slate-200 bg-white transition-all duration-200 ${
          collapsed ? "w-10" : "w-96"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          {!collapsed && (
            <span className="text-sm font-semibold text-slate-700">
              Source
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          >
            {collapsed ? (
              <ChevronLeft className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
        </div>

        {/* Panel body */}
        {!collapsed && (
          <>
            <textarea
              value={source}
              onChange={handleSourceChange}
              spellCheck={false}
              className="flex-1 resize-none border-0 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 outline-none"
              aria-label="MCU project source JSON"
            />
            {/* Error / status area */}
            {error && (
              <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs font-mono text-red-700">
                {error}
              </div>
            )}
            {!error &&
              statusMessages.length > 0 &&
              projection?.status.level !== "ready" && (
                <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs font-mono text-amber-700">
                  {statusMessages.map((msg, i) => (
                    <div key={i}>{msg}</div>
                  ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
