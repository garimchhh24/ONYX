import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="eyebrow mb-3">404</div>
        <h1 className="font-display text-2xl font-semibold">This page doesn’t exist</h1>
        <Link href="/" className="mt-6 inline-block text-sm text-violet hover:text-violet-soft">
          Back to dashboard →
        </Link>
      </div>
    </div>
  );
}
