/**
 * Veralogix Group corporate design palette.
 *
 * Kept as raw hex here (in addition to the Tailwind tokens) so inline SVG
 * components — logo, avatars — can reference the exact brand values without a
 * className, which SVG attributes require.
 */
export const VERALOGIX = {
  /** Primary — CTAs, focus rings, active boundaries, drag handles, priority. */
  lime: '#8DC63F',
  /** Darker lime used for button hover states. */
  limeHover: '#7AB533',
  /** Secondary — nav text, headers, sidebars, overlays, body copy. */
  charcoal: '#231F20',
  /** Workspace canvas & list container backgrounds. */
  grey: '#F1F2F2',
  /** Card / panel / modal surfaces. */
  white: '#FFFFFF',
} as const;
