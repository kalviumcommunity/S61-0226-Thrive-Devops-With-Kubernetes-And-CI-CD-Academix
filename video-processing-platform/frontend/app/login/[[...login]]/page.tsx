import { SignIn } from "@clerk/nextjs";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <SignIn path="/login" signUpUrl="/sign-up" forceRedirectUrl="/" />
    </div>
  );
}
