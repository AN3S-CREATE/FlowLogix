interface ProgressBarProps {
  /** 0..1 completion ratio. */
  value: number;
  label?: string;
}

/** Progress meter with a solid Veralogix Lime fill on a cool-grey track. */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-veralogix-charcoal/60">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-veralogix-grey"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-veralogix-lime transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
