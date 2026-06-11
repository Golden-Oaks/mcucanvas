# mcucanvas

Live peripheral-card rendering + client-side simulation for MCU topology editors.

Depends on Tailwind v4 for styling — consumers should add `@source` to pick up the utility classes.

## Editing

```tsx
import { SimulationStateProvider, McuCanvasEditor } from "mcucanvas";
import type { CanvasProjection, CanvasCommand, CanvasSelection } from "mcucanvas";

function App() {
  const [projection, setProjection] = useState<CanvasProjection>(/* … */);
  const [selection, setSelection] = useState<CanvasSelection>({});

  const handleChange = async (next: CanvasProjection, intent: CanvasCommand) => {
    // Persist to server / CLI here. The editor has already applied the
    // change optimistically for instant feedback; reconcile back via
    // setProjection(next) when the server confirms, or revert if it rejects.
    await persistCanvasMutation(intent);
    setProjection(next);
  };

  return (
    <SimulationStateProvider transport={/* … */}>
      <McuCanvasEditor
        projection={projection}
        onChange={handleChange}
        selection={selection}
        onSelectionChange={setSelection}
      />
    </SimulationStateProvider>
  );
}
```

**Controlled + optimistic contract:** The editor holds an internal optimistic copy
of `projection` and applies `applyCommand` from `mutations.ts` for instant
feedback. It emits `onChange(next, intent)` on every successful mutation. When
the `projection` prop changes (the consumer's authoritative truth arrives), the
editor reconciles back. This lets the consumer run server-side validation or CLI
execution while the UI stays responsive.

**Requirement:** The editor MUST be rendered inside a `<SimulationStateProvider>`.
Do NOT wrap one inside the editor — the consumer provides it.

Tailwind consumers should add `@source "../../node_modules/mcucanvas/dist"` (or the
equivalent path) to pick up the library's utility classes.
