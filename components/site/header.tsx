import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { SignOutButton } from './sign-out-button';

export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-ink hover:text-accent transition-colors"
        >
          <span className="text-lg font-semibold tracking-tight">BiasLens</span>
          <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            beta
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/history" className="text-ink-muted hover:text-ink transition-colors">
                History
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
