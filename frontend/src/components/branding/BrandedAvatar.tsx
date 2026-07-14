import { useId } from 'react';
import { VERALOGIX } from '../../brand/colors';

interface BrandedAvatarProps {
  firstName: string;
  lastName: string;
  /** Diameter in pixels. */
  size?: number;
  /** Optional ring — used on member-header avatars to lift them off the bar. */
  ring?: boolean;
  className?: string;
  title?: string;
}

const initialsOf = (firstName: string, lastName: string): string => {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
};

/**
 * Dynamic, dependency-free profile picture rendered entirely as inline SVG:
 * the user's initials centred over the Veralogix Lime Green field with a
 * subtle 15%-opacity network node-mesh watermark. Never falls back to a
 * generic image URL or an unstyled text circle (per brand guidelines).
 */
export function BrandedAvatar({
  firstName,
  lastName,
  size = 32,
  ring = false,
  className,
  title,
}: BrandedAvatarProps) {
  const initials = initialsOf(firstName, lastName);
  const label = title ?? `${firstName} ${lastName}`.trim();
  // useId keeps the clipPath/gradient ids unique when many avatars render.
  const uid = useId().replace(/:/g, '');
  const clipId = `av-clip-${uid}`;
  const gradId = `av-grad-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{label}</title>
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        <radialGradient id={gradId} cx="32%" cy="28%" r="80%">
          {/* Slight lift at the top-left for depth, settling to the brand lime. */}
          <stop offset="0%" stopColor="#9BD24F" />
          <stop offset="100%" stopColor={VERALOGIX.lime} />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect width="64" height="64" fill={`url(#${gradId})`} />

        {/* Network node-mesh watermark at 15% opacity. */}
        <g opacity="0.15" stroke={VERALOGIX.white} strokeWidth="1.2">
          <line x1="8" y1="14" x2="26" y2="30" />
          <line x1="26" y1="30" x2="52" y2="10" />
          <line x1="26" y1="30" x2="18" y2="54" />
          <line x1="26" y1="30" x2="50" y2="46" />
          <line x1="52" y1="10" x2="58" y2="34" />
          <line x1="18" y1="54" x2="50" y2="46" />
        </g>
        <g opacity="0.15" fill={VERALOGIX.white}>
          <circle cx="8" cy="14" r="2.4" />
          <circle cx="26" cy="30" r="3" />
          <circle cx="52" cy="10" r="2.4" />
          <circle cx="18" cy="54" r="2.4" />
          <circle cx="50" cy="46" r="2.4" />
          <circle cx="58" cy="34" r="2.4" />
        </g>

        {/* Initials */}
        <text
          x="32"
          y="33"
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
          fontSize="26"
          fontWeight="700"
          letterSpacing="0.5"
          fill={VERALOGIX.white}
        >
          {initials}
        </text>
      </g>

      {ring && (
        <circle
          cx="32"
          cy="32"
          r="31"
          fill="none"
          stroke={VERALOGIX.white}
          strokeWidth="2"
        />
      )}
    </svg>
  );
}
