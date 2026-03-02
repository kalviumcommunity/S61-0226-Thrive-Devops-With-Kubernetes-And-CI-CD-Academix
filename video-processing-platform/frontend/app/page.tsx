import {
  Activity,
  Cloud,
  Shield,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import Footer from "../components/Footer";
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
  const user = await currentUser();
  const sessionRole =
    (sessionClaims?.metadata as { role?: string } | undefined)?.role ??
    (sessionClaims?.public_metadata as { role?: string } | undefined)?.role ??
    (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  const userRole =
    (user?.publicMetadata?.role as string | undefined) ??
    (user?.unsafeMetadata?.role as string | undefined);
  const role = (sessionRole ?? userRole ?? "").toLowerCase().trim();

  return (
  <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
    <Navbar active="none" />

    <main>
      {/* HERO SECTION */}
      <section className="relative overflow-hidden">
        {/* Decorative Background Blur */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-150px] h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-200 blur-3xl opacity-30" />
        </div>

        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <span className="inline-block rounded-full bg-indigo-100 px-4 py-1 text-sm font-medium text-indigo-700">
            AI-Powered Learning Platform
          </span>

          <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight md:text-6xl">
            Next-Gen Learning
            <span className="block bg-gradient-to-r from-indigo-600 to-amber-500 bg-clip-text text-transparent">
              Fault-Tolerant Streaming
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Academix is a scalable educational platform designed for modern
            classrooms. Upload lectures once, transcode automatically, and
            stream with AI-enhanced captions — all backed by a resilient job
            processing pipeline.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <SignedIn>
              <Link
                href={role === "admin" ? "/admin/dashboard" : "/student"}
                className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-1 hover:bg-indigo-700"
              >
                Go to Dashboard
              </Link>
            </SignedIn>

            <Link
              href="#features"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
            >
              Explore Features
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section
        id="features"
        className="mx-auto max-w-6xl px-6 py-20"
      >
        <div className="text-center">
          <h2 className="text-4xl font-bold text-slate-900">
            The Resilient Video Pipeline
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">
            Built to handle thousands of concurrent uploads and viewers with
            zero-downtime architecture.
          </p>
        </div>

        <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article
                key={feature.title}
                className="group relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm transition duration-300 hover:-translate-y-2 hover:shadow-xl"
              >
                {/* Gradient border on hover */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-200 to-amber-200 opacity-0 blur-xl transition group-hover:opacity-30" />

                <div className="relative z-10">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="mt-6 text-xl font-semibold text-slate-900">
                    {feature.title}
                  </h3>

                  <p className="mt-4 text-sm leading-6 text-slate-600">
                    {feature.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>

    <Footer />
  </div>
);
}
