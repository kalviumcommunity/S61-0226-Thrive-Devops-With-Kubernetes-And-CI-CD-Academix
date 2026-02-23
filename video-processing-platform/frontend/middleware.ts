import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/student(.*)", "/admin(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isStudentRoute = createRouteMatcher(["/student(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn, sessionClaims } = await auth();

  if (isProtectedRoute(req) && !userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
  }

  const sessionRole =
    (sessionClaims?.metadata as { role?: string } | undefined)?.role ??
    (sessionClaims?.public_metadata as { role?: string } | undefined)?.role;
  const role = (sessionRole ?? "").toLowerCase().trim();

  if (userId && isAdminRoute(req) && role !== "admin") {
    return NextResponse.redirect(new URL("/student", req.url));
  }

  if (userId && isStudentRoute(req) && role === "admin") {
    return NextResponse.redirect(new URL("/admin/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
