import {
  Activity,
  Cloud,
  Shield,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import Navbar from "../components/Navbar";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: Zap,
    title: "Fast Transcoding",
    description:
      "Distributed workers process video files into multiple resolutions and bitrates automatically.",
  },
  {
    icon: Shield,
    title: "Fault Tolerant",
    description:
      "Built-in retry mechanism with exponential backoff ensures no transcoding job is ever lost.",
  },
  {
    icon: Cloud,
    title: "Cloud Native",
    description:
      "Stateless architecture supports auto-scaling and maintenance-free updates.",
  },
  {
    icon: Target,
    title: "AI Captions",
    description:
      "Proprietary AI context-lookup enhances technical lecture captions for 99% accuracy.",
  },
  {
    icon: Activity,
    title: "Pipeline Monitoring",
    description:
      "Real-time dashboard for administrators to track system health and job statuses.",
  },
  {
    icon: Timer,
    title: "SLA Guaranteed",
    description:
      "Engineered for 99.99% availability for both instructors and students.",
  },
];

export default async function Home() {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Navbar active="none" />

      <main>
        <section className="bg-gradient-to-r from-white via-indigo-50 to-amber-50">
          <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
            <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight text-indigo-700 md:text-6xl">
              Next-Gen Learning
              <span className="block text-amber-500">Fault-Tolerant Streaming</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-500">
              Academix is a world-class educational platform designed for scale. Upload
              lectures once, transcode them for any device, and stream with AI-enhanced
              captions—all backed by a resilient job processing pipeline.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <SignedOut>
                <Link
                  href="/login"
                  className="rounded-lg bg-indigo-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"
                >
                  Login
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-lg border border-indigo-700 bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Sign Up
                </Link>
              </SignedOut>

              <SignedIn>
                <Link
                  href={role === "admin" ? "/admin/dashboard" : "/student"}
                  className="rounded-lg bg-indigo-700 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"
                >
                  Go to Dashboard
                </Link>
              </SignedIn>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14 md:py-16">
          <div className="text-center">
            <h2 className="text-4xl font-semibold text-slate-900">
              The Resilient Video Pipeline
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
              Built to handle thousands of concurrent uploads and viewers with a
              zero-downtime architecture.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <article
                  key={feature.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-amber-100 text-amber-500">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-400">
        © 2026 Academix Learning Platform. Built for the future of education.
      </footer>
    </div>
  );
}
