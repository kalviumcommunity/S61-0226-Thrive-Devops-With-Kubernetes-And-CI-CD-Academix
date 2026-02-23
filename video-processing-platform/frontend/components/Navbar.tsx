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
  const sessionRole = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  const userRole = (user?.publicMetadata?.role as string | undefined) ?? (user?.unsafeMetadata?.role as string | undefined);
  const role = (sessionRole ?? userRole ?? "").toLowerCase().trim();
  const isAdmin = role === "admin";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold text-indigo-700">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600 text-white">
            <Clapperboard className="h-4 w-4" />
          </span>
          Academix
        </Link>

        <SignedIn>
          <nav className="hidden items-center gap-5 text-xs text-slate-500 md:flex">
            {!isAdmin ? (
              <Link
                href="/student"
                className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
                  active === "library" ? "rounded-md bg-indigo-100 px-2 py-0.5 text-indigo-700" : ""
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Student Library
              </Link>
            ) : null}

            {isAdmin ? (
              <>
                <Link
                  href="/admin/dashboard"
                  className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
                    active === "admin" ? "rounded-md bg-indigo-100 px-2 py-0.5 text-indigo-700" : ""
                  }`}
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  Admin Dashboard
                </Link>
                <Link
                  href="/admin/dashboard"
                  className={`inline-flex items-center gap-1.5 hover:text-indigo-700 ${
                    active === "monitoring" ? "rounded-md bg-indigo-100 px-2 py-0.5 text-indigo-700" : ""
                  }`}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  Job Monitoring
                </Link>
              </>
            ) : null}
          </nav>

          <SignOutButton>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </SignOutButton>
        </SignedIn>

        <SignedOut>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogIn className="h-3.5 w-3.5" />
              Login
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-700 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Sign Up
            </Link>
          </div>
        </SignedOut>
      </div>
    </header>
  );
}