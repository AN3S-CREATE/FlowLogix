import { ButtonHTMLAttributes } from 'react';

/**
 * Core call-to-action button. Smoothly transitions background from the
 * Veralogix lime to the darker lime on hover, with a lime focus-offset ring.
 */
export function PrimaryButton({
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={
        'inline-flex items-center justify-center gap-2 rounded-md bg-veralogix-lime ' +
        'px-4 py-2 text-sm font-semibold text-veralogix-charcoal shadow-sm ' +
        'transition-colors duration-150 ease-out hover:bg-veralogix-lime-hover ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-veralogix-lime ' +
        'focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ' +
        className
      }
      {...props}
    />
  );
}
