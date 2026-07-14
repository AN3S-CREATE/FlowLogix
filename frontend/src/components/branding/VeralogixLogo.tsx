import { VERALOGIX } from '../../brand/colors';

interface VeralogixLogoProps {
  /** Overall pixel height of the lockup; width scales with the aspect ratio. */
  height?: number;
  /** Render the wordmark next to the globe mark (false = mark only). */
  showWordmark?: boolean;
  /**
   * Use the light treatment (white wordmark) for placement on the charcoal
   * navigation bar; default is the dark treatment for light surfaces.
   */
  variant?: 'dark' | 'light';
  className?: string;
  title?: string;
}

/**
 * Official Veralogix Group logo, rendered as an inline SVG (never a raster
 * fallback). The mark is the corporate "network globe" — a meridian/parallel
 * sphere overlaid with a node mesh in Lime Green — paired with the customised
 * "VERALOGIX" wordmark.
 */
export function VeralogixLogo({
  height = 32,
  showWordmark = true,
  variant = 'dark',
  className,
  title = 'Veralogix Group',
}: VeralogixLogoProps) {
  const wordmarkFill = variant === 'light' ? VERALOGIX.white : VERALOGIX.charcoal;
  const viewBoxWidth = showWordmark ? 208 : 48;
  const width = (viewBoxWidth / 48) * height;

  return (
    <svg
      height={height}
      width={width}
      viewBox={`0 0 ${viewBoxWidth} 48`}
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* Network globe mark */}
      <g>
        <circle cx="24" cy="24" r="19" fill={VERALOGIX.charcoal} />
        {/* meridians & parallels */}
        <g
          fill="none"
          stroke={VERALOGIX.white}
          strokeWidth="1"
          strokeOpacity="0.35"
        >
          <circle cx="24" cy="24" r="19" />
          <ellipse cx="24" cy="24" rx="8.5" ry="19" />
          <ellipse cx="24" cy="24" rx="19" ry="8.5" />
          <line x1="5" y1="24" x2="43" y2="24" />
          <line x1="24" y1="5" x2="24" y2="43" />
        </g>
        {/* node mesh in lime */}
        <g stroke={VERALOGIX.lime} strokeWidth="1.4" strokeOpacity="0.9">
          <line x1="15" y1="16" x2="24" y2="24" />
          <line x1="24" y1="24" x2="33" y2="17" />
          <line x1="24" y1="24" x2="19" y2="33" />
          <line x1="24" y1="24" x2="32" y2="31" />
          <line x1="15" y1="16" x2="19" y2="33" />
        </g>
        <g fill={VERALOGIX.lime}>
          <circle cx="24" cy="24" r="2.6" />
          <circle cx="15" cy="16" r="2" />
          <circle cx="33" cy="17" r="2" />
          <circle cx="19" cy="33" r="2" />
          <circle cx="32" cy="31" r="2" />
        </g>
      </g>

      {/* Wordmark */}
      {showWordmark && (
        <g>
          <text
            x="54"
            y="27"
            fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            fontSize="19"
            fontWeight="700"
            letterSpacing="0.5"
            fill={wordmarkFill}
          >
            VERA
            <tspan fill={VERALOGIX.lime}>LOGIX</tspan>
          </text>
          <text
            x="55"
            y="39"
            fontFamily="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            fontSize="7.5"
            fontWeight="600"
            letterSpacing="3.6"
            fill={variant === 'light' ? VERALOGIX.grey : VERALOGIX.charcoal}
            opacity={variant === 'light' ? 0.75 : 0.6}
          >
            GROUP
          </text>
        </g>
      )}
    </svg>
  );
}
