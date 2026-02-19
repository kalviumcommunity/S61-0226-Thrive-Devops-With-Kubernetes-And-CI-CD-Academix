"use client";

import { useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type UserRole = "student" | "admin";

async function persistUserRole(role: UserRole) {
  await fetch("/api/users/role", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role }),
  });
}

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getErrorMessage = (input: unknown, fallback: string) => {
    if (isClerkAPIResponseError(input)) {
      return input.errors[0]?.longMessage ?? fallback;
    }

    return fallback;
  };

  const completeOnboarding = async (sessionId: string | null, assignedRole: UserRole) => {
    if (!sessionId) {
      setError("Could not create an active session. Please sign in.");
      return;
    }

    if (!setActive) {
      setError("Could not create an active session. Please sign in.");
      return;
    }

    await setActive({ session: sessionId });
    await persistUserRole(assignedRole);
    router.push(assignedRole === "admin" ? "/admin/dashboard" : "/student");
  };

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isLoaded) {
      return;
    }

    try {
      setIsSubmitting(true);

      const created = await signUp.create({
        firstName,
        lastName,
        emailAddress,
        password,
        unsafeMetadata: {
          role,
        },
      });

      if (created.status === "complete") {
        await completeOnboarding(created.createdSessionId, role);
        return;
      }

      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });
      setPendingVerification(true);
    } catch (createError: unknown) {
      setError(getErrorMessage(createError, "Sign up failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isLoaded) {
      return;
    }

    try {
      setIsSubmitting(true);

      const verified = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (verified.status !== "complete") {
        setError("Verification not complete. Please check your code and retry.");
        return;
      }

      await completeOnboarding(verified.createdSessionId, role);
    } catch (verifyError: unknown) {
      setError(getErrorMessage(verifyError, "Verification failed. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">Choose your role and get started with Academix.</p>

        {!pendingVerification ? (
          <form className="mt-6 space-y-4" onSubmit={handleCreateAccount}>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                required
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
                required
              />
            </div>

            <input
              type="email"
              placeholder="Email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              required
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              required
            />

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              >
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <div id="clerk-captcha" className="min-h-8" />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleVerifyCode}>
            <p className="text-sm text-slate-600">Enter the verification code sent to your email.</p>
            <input
              type="text"
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value)}
              placeholder="Verification code"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              required
            />

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Verifying..." : "Verify & Continue"}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-indigo-700 hover:text-indigo-800">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
