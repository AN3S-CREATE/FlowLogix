import { FormEvent, useState } from 'react';
import { VeralogixLogo } from '../branding/VeralogixLogo';
import { PrimaryButton } from '../ui/PrimaryButton';
import { BrandedAvatar } from '../branding/BrandedAvatar';
import { login } from '../../api/authApi';
import { ApiError } from '../../api/http';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

/**
 * Branded sign-in gate shown when `VITE_API_URL` is set and no session exists.
 */
export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState('andries@veralogix.co.za');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      onAuthenticated();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Login failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-veralogix-charcoal px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, #8DC63F55, transparent), ' +
            'radial-gradient(ellipse 60% 40% at 100% 100%, #8DC63F22, transparent)',
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <VeralogixLogo height={40} variant="light" />
          <p className="text-sm text-white/70">
            Sign in to load your organization&apos;s boards from the API.
          </p>
          <BrandedAvatar firstName="V" lastName="G" size={48} ring />
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-xl bg-white p-6 shadow-lg"
        >
          <label className="mb-4 block text-sm font-medium text-veralogix-charcoal">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-veralogix-grey bg-white px-3 py-2 text-sm text-veralogix-charcoal shadow-sm focus:border-veralogix-lime focus:outline-none focus:ring-2 focus:ring-veralogix-lime"
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-veralogix-charcoal">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-veralogix-grey bg-white px-3 py-2 text-sm text-veralogix-charcoal shadow-sm focus:border-veralogix-lime focus:outline-none focus:ring-2 focus:ring-veralogix-lime"
            />
          </label>

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {error}
            </p>
          )}

          <PrimaryButton type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
