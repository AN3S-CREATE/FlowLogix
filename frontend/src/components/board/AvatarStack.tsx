import { BrandedAvatar } from '../branding/BrandedAvatar';
import { useBoardStore } from '../../store/useBoardStore';

interface AvatarStackProps {
  memberIds: string[];
  size?: number;
  ring?: boolean;
  /** Show at most this many; the rest collapse into a +N chip. */
  max?: number;
}

/** Overlapping stack of BrandedAvatars for a card's assignees or a board's members. */
export function AvatarStack({ memberIds, size = 28, ring = false, max = 4 }: AvatarStackProps) {
  const members = useBoardStore((s) => s.members);
  // Drop unknown ids first so the first avatar keeps index 0 (its marginLeft
  // must be 0, not negative) and the +N overflow count stays accurate.
  const validIds = memberIds.filter((id) => Boolean(members[id]));
  const shown = validIds.slice(0, max);
  const overflow = validIds.length - shown.length;

  return (
    <div className="flex items-center">
      {shown.map((id, i) => {
        const m = members[id];
        return (
          <div
            key={id}
            className="rounded-full ring-2 ring-white"
            style={{ marginLeft: i === 0 ? 0 : -size / 3.5, zIndex: shown.length - i }}
            title={`${m.firstName} ${m.lastName}`}
          >
            <BrandedAvatar firstName={m.firstName} lastName={m.lastName} size={size} ring={ring} />
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className="flex items-center justify-center rounded-full bg-veralogix-charcoal text-[11px] font-semibold text-white ring-2 ring-white"
          style={{ width: size, height: size, marginLeft: -size / 3.5 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
