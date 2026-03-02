"use client";

import { SignedIn, SignedOut, SignOutButton, useAuth, useUser } from "@clerk/nextjs";
import { BookOpen, Clapperboard, Gauge, LayoutDashboard, LogIn, LogOut, UserPlus } from "lucide-react";
import Link from "next/link";

type NavbarProps = {
  active?: "library" | "admin" | "monitoring" | "none";
};

export default function Navbar({ active = "none" }: NavbarProps) {
  const { user } = useUser();
  const { sessionClaims } = useAuth();
  const sessionRole =
    (sessionClaims?.metadata as { role?: string } | undefined)?.role ??
    (sessionClaims?.public_metadata as { role?: string } | undefined)?.role ??
    (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  const userRole =
    (user?.publicMetadata?.role as string | undefined) ??
    (user?.unsafeMetadata?.role as string | undefined);
  const role = (sessionRole ?? userRole ?? "").toLowerCase().trim();
  const isAdmin = role === "admin";

  return (
  <header className="sticky top-0 z-50 w-full border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
    <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-6">
      
      {/* LOGO */}
      <Link
        href="/"
        className="group flex items-center gap-3 text-xl font-semibold tracking-tight"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-md transition group-hover:scale-105">
          <Clapperboard className="h-5 w-5" />
        </span>
        <span className="bg-gradient-to-r from-indigo-700 to-violet-600 bg-clip-text text-transparent">
          Academix
        </span>
      </Link>

      {/* NAV LINKS */}
      <SignedIn>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          {!isAdmin && (
            <Link
              href="/student"
              className={`relative flex items-center gap-2 transition hover:text-indigo-600 ${
                active === "library" ? "text-indigo-600" : ""
              }`}
            >
              <BookOpen className="h-4 w-4" />
              Student Library
              {active === "library" && (
                <span className="absolute -bottom-2 left-0 h-0.5 w-full bg-indigo-600 rounded-full" />
              )}
            </Link>
          )}

          {isAdmin && (
            <>
              <Link
                href="/admin/dashboard"
                className={`relative flex items-center gap-2 transition hover:text-indigo-600 ${
                  active === "admin" ? "text-indigo-600" : ""
                }`}
              >
                <LayoutDashboard className="h-4 w-4" />
                Admin Dashboard
                {active === "admin" && (
                  <span className="absolute -bottom-2 left-0 h-0.5 w-full bg-indigo-600 rounded-full" />
                )}
              </Link>

              <Link
                href="/admin/job-monitoring"
                className={`relative flex items-center gap-2 transition hover:text-indigo-600 ${
                  active === "monitoring" ? "text-indigo-600" : ""
                }`}
              >
                <Gauge className="h-4 w-4" />
                Job Monitoring
                {active === "monitoring" && (
                  <span className="absolute -bottom-2 left-0 h-0.5 w-full bg-indigo-600 rounded-full" />
                )}
              </Link>
            </>
          )}
        </nav>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-4">
          <SignOutButton>
            <button className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </SignOutButton>
        </div>
      </SignedIn>

      {/* SIGNED OUT */}
      <SignedOut>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md"
          >
            <LogIn className="h-4 w-4" />
            Login
          </Link>

          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <UserPlus className="h-4 w-4" />
            Get Started
          </Link>
        </div>
      </SignedOut>
    </div>
  </header>
);
}