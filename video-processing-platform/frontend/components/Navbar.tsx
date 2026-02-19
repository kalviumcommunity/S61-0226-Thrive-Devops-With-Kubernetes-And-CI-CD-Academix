import { BookOpen, Clapperboard, Gauge, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";

type NavbarProps = {
  active?: "library" | "admin" | "monitoring" | "none";
};

export default function Navbar({ active = "none" }: NavbarProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-indigo-700">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white">
            <Clapperboard className="h-4 w-4" />
          </span>
          Academix
        </Link>

        <nav className="hidden items-center gap-6 text-xs text-slate-500 md:flex lg:text-sm">
          <Link
            href="#"
            className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
              active === "library" ? "rounded-md bg-indigo-100 px-2.5 py-1 text-indigo-700" : ""
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Student Library
          </Link>
          <Link
            href="/admin/dashboard"
            className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
              active === "admin" ? "rounded-md bg-indigo-100 px-2.5 py-1 text-indigo-700" : ""
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Admin Dashboard
          </Link>
          <a
            href="#"
            className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
              active === "monitoring" ? "rounded-md bg-indigo-100 px-2.5 py-1 text-indigo-700" : ""
            }`}
          >
            <Gauge className="h-4 w-4" />
            Job Monitoring
          </a>
        </nav>

        <button className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </header>
  );
}