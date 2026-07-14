import { useBoardStore } from '../../store/useBoardStore';
import { VeralogixLogo } from '../branding/VeralogixLogo';
import { AvatarStack } from './AvatarStack';
import { PrimaryButton } from '../ui/PrimaryButton';

/**
 * Corporate navigation bar (Charcoal) carrying the inline Veralogix logo,
 * the active board title, the member avatar stack, and the primary CTA.
 */
export function AppHeader() {
  const board = useBoardStore((s) => s.board);

  return (
    <header className="flex items-center justify-between gap-4 bg-veralogix-charcoal px-6 py-3 shadow-sm">
      <div className="flex items-center gap-4">
        <VeralogixLogo height={30} variant="light" />
        <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden="true" />
        <h1 className="hidden text-base font-semibold text-white sm:block">
          {board.title}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <AvatarStack memberIds={board.memberIds} size={30} ring max={5} />
        <PrimaryButton>
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
            <path d="M8 2.5a.9.9 0 0 1 .9.9v3.7h3.7a.9.9 0 1 1 0 1.8H8.9v3.7a.9.9 0 1 1-1.8 0V8.9H3.4a.9.9 0 1 1 0-1.8h3.7V3.4A.9.9 0 0 1 8 2.5Z" />
          </svg>
          Add card
        </PrimaryButton>
      </div>
    </header>
  );
}
