import Link from 'next/link';

export function SiteHeader() {
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
      </div>
    </header>
  );
}
