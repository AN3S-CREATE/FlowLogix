import { ChecklistItem } from '../../store/types';

interface ChecklistProps {
  items: ChecklistItem[];
  onToggle: (itemId: string) => void;
}

/** Interactive checklist; each ticked box fills solid Veralogix Lime. */
export function Checklist({ items, onToggle }: ChecklistProps) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <label className="group flex cursor-pointer items-center gap-2 text-xs text-veralogix-charcoal/80">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              onClick={() => onToggle(item.id)}
              className={
                'flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-veralogix-lime focus-visible:ring-offset-1 ' +
                (item.done
                  ? 'border-veralogix-lime bg-veralogix-lime'
                  : 'border-veralogix-charcoal/25 bg-white group-hover:border-veralogix-lime')
              }
            >
              {item.done && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                  <path
                    d="M2.5 6.2l2.2 2.2L9.5 3.6"
                    fill="none"
                    stroke="#231F20"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <span className={item.done ? 'line-through opacity-60' : ''}>{item.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
