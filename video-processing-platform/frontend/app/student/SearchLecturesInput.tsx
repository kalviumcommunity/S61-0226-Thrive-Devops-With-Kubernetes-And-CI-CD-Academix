"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type SearchLecturesInputProps = {
  initialQuery?: string;
};

export default function SearchLecturesInput({ initialQuery = "" }: SearchLecturesInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const nextQuery = value.trim();

      if (nextQuery) {
        params.set("q", nextQuery);
      } else {
        params.delete("q");
      }

      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 300);

    return () => clearTimeout(handle);
  }, [value, pathname, router, searchParams]);

  return (
    <label className="group mt-1 flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 shadow-sm transition focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
      <Search className="h-4 w-4 transition group-focus-within:text-indigo-600" />
      <input
        type="text"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search lectures..."
        className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
      />
    </label>
  );
}
