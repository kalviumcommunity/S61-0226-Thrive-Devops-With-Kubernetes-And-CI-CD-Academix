import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/student(.*)", "/admin(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isStudentRoute = createRouteMatcher(["/student(.*)"]);

const disableAuth = process.env.DISABLE_AUTH === "true";

async function authHandler(
    auth: () => Promise<{
        userId: string | null;
        redirectToSignIn: (opts: { returnBackUrl: string }) => Response;
        sessionClaims: unknown;
    }>,
    req: NextRequest,
) {
    const { userId, redirectToSignIn, sessionClaims } = await auth();

    if (isProtectedRoute(req) && !userId) {
        return redirectToSignIn({ returnBackUrl: req.url });
    }

    const sessionRole =
        (sessionClaims as { metadata?: { role?: string }; public_metadata?: { role?: string } })?.metadata?.role ??
        (sessionClaims as { metadata?: { role?: string }; public_metadata?: { role?: string } })?.public_metadata?.role;
    const role = (sessionRole ?? "").toLowerCase().trim();
    const hasRole = role.length > 0;

    if (userId && isAdminRoute(req) && hasRole && role !== "admin") {
        return NextResponse.redirect(new URL("/student", req.url));
    }

    if (userId && isStudentRoute(req) && role === "admin") {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }

    return NextResponse.next();
}

const clerkHandler = clerkMiddleware(authHandler);

export default function proxy(req: NextRequest, evt: NextFetchEvent) {
    if (disableAuth) {
        return NextResponse.next();
    }

    return clerkHandler(req, evt);
}

export const config = {
    matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};