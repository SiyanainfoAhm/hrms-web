import Link from "next/link";
import { StartButton } from "../components/StartButton";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white rounded-xl shadow-lg border border-[var(--border)] p-8 animate-fade-in">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Master frontend starter
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Copy into any project and start building immediately.
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-bold border">
            M
          </div>
        </div>

        <div className="mt-6">
          <StartButton className="w-full px-4 py-3 rounded-lg bg-violet-600 hover:bg-violet-700 transition font-semibold text-sm text-white text-center disabled:opacity-60">
            Start
          </StartButton>
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-600">
            <span>New here?</span>
            <Link className="font-semibold text-violet-700 hover:text-violet-800" href="/auth/signup">
              Create an account
            </Link>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            className="px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition font-semibold text-sm"
            href="/app/demo"
          >
            View app shell demo
          </Link>
          <Link
            className="px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition font-semibold text-sm"
            href="/auth/login"
          >
            View auth templates
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          Customize branding, theme, sidebar items, roles and auth methods via
          `src/config/*`.
        </p>
      </div>
    </main>
  );
}

