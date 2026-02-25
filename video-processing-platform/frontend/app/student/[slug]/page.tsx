import { ArrowRight } from "lucide-react"; // kept for potential use in links
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "../../../components/Footer";
import Navbar from "../../../components/Navbar";
import { fetchLecture, fetchLectures, resolveApiUrl } from "../lectures";
import LectureDetailClient from "./LectureDetailClient";

type LecturePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LecturePage({ params }: LecturePageProps) {
  const { slug } = await params;
  let lecture;

  try {
    lecture = await fetchLecture(slug);
  } catch {
    notFound();
  }

  const videoSrc = resolveApiUrl(lecture.videoUrl);
  const lectures = await fetchLectures();
  const currentIndex = lectures.findIndex((entry) => entry.slug === lecture.slug);
  const nextLecture = currentIndex >= 0 ? lectures[currentIndex + 1] : undefined;

  // state managed via client components below
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Navbar active="library" />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-6 py-6 lg:py-8">
          {/* lecture content and layout moved into client component */}
          <LectureDetailClient
            lecture={lecture}
            nextLecture={nextLecture}
            videoSrc={videoSrc}
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
