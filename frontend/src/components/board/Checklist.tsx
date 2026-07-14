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
          {/*
            A real (visually hidden) checkbox input drives state and keyboard
            focus; the styled div is the visible box. This keeps the markup
            valid — no interactive control nested inside the label.
          */}
          <label className="group flex cursor-pointer items-center gap-2 text-xs text-veralogix-charcoal/80">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => onToggle(item.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={
                'flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors ' +
                'group-focus-within:ring-2 group-focus-within:ring-veralogix-lime group-focus-within:ring-offset-1 ' +
                (item.done
                  ? 'border-veralogix-lime bg-veralogix-lime'
                  : 'border-veralogix-charcoal/25 bg-white group-hover:border-veralogix-lime')
              }
            >
              {item.done && (
                <svg viewBox="0 0 12 12" className="h-3 w-3">
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
            </span>
            <span className={item.done ? 'line-through opacity-60' : ''}>{item.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
