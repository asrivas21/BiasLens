// Static gradient bar with a tick at the analysis's biasScore. Renders on the
// server; no animation, no interaction. Mirrors the AllSides-style strip the
// user pointed at as a visual reference.
type BiasScaleProps = {
  biasScore: number;
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function BiasScale({ biasScore }: BiasScaleProps) {
  const clamped = clamp(biasScore, -1, 1);
  // Map [-1, +1] to [0%, 100%].
  const markerPct = ((clamped + 1) / 2) * 100;

  return (
    <div className="w-full">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, var(--color-lean-far-left) 0%, var(--color-lean-left) 25%, var(--color-lean-center) 50%, var(--color-lean-right) 75%, var(--color-lean-far-right) 100%)',
          }}
        />
        <div
          className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-md ring-2 ring-canvas"
          style={{ left: `${markerPct}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium uppercase tracking-widest text-ink-muted">
        <span>Far left</span>
        <span>Left</span>
        <span>Center</span>
        <span>Right</span>
        <span>Far right</span>
      </div>
    </div>
  );
}
