import { useBoardStore } from '../../store/useBoardStore';
import { VeralogixLogo } from '../branding/VeralogixLogo';
import { AvatarStack } from './AvatarStack';
import { ConnectionStatus } from './ConnectionStatus';
import { PrimaryButton } from '../ui/PrimaryButton';
import { isApiMode } from '../../api/config';
import { logout } from '../../api/authApi';
import { BrandedAvatar } from '../branding/BrandedAvatar';
import { getAuthUser } from '../../api/session';

/**
 * Corporate navigation bar (Charcoal) carrying the inline Veralogix logo,
 * the active board title, the member avatar stack, and the primary CTA.
 */
export function AppHeader() {
  const board = useBoardStore((s) => s.board);
  const lists = useBoardStore((s) => s.lists);
  const addCard = useBoardStore((s) => s.addCard);
  const firstListId = lists[0]?.id;
  const user = isApiMode() ? getAuthUser() : null;

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
        <ConnectionStatus />
        <AvatarStack memberIds={board.memberIds} size={30} ring max={5} />
        {user && (
          <div className="hidden items-center gap-2 sm:flex" title={user.email}>
            <BrandedAvatar
              firstName={user.firstName}
              lastName={user.lastName}
              size={30}
              ring
            />
            <button
              type="button"
              onClick={() => {
                logout();
                window.location.reload();
              }}
              className="text-xs font-medium text-white/70 hover:text-white"
            >
              Sign out
            </button>
          </div>
        )}
        <PrimaryButton
          onClick={() => firstListId && void addCard(firstListId, 'New card')}
          disabled={!firstListId}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="currentColor">
            <path d="M8 2.5a.9.9 0 0 1 .9.9v3.7h3.7a.9.9 0 1 1 0 1.8H8.9v3.7a.9.9 0 1 1-1.8 0V8.9H3.4a.9.9 0 1 1 0-1.8h3.7V3.4A.9.9 0 0 1 8 2.5Z" />
          </svg>
          Add card
        </PrimaryButton>
      </div>
    </header>
  );
}
