"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function redirectAuthenticatedUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (isCurrent && user) {
        router.replace("/dashboard");
      }
    }

    void redirectAuthenticatedUser();

    return () => {
      isCurrent = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(
        error.message === "Invalid login credentials"
          ? "Email or password is incorrect. Please try again."
          : error.message,
      );
      setIsSubmitting(false);
      return;
    }

    router.replace("/dashboard");
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-slate-950">
      <div className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.26),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.18),transparent_30%)]" />
      <div className="absolute -bottom-48 -right-40 -z-10 h-[28rem] w-[28rem] rounded-full bg-teal-400/10 blur-3xl" />

      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-white p-7 shadow-2xl shadow-black/30 sm:p-10">
        <div className="mb-9">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white shadow-lg shadow-teal-700/25">
            A
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-700">
            AROVIA SENTINEL
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Sign in to the command centre
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Access is resolved from your verified Sentinel profile after sign in.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="email">
              Email address
            </label>
            <input
              autoComplete="email"
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="password">
              Password
            </label>
            <input
              autoComplete="current-password"
              className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>

          {errorMessage ? (
            <p aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            className="flex w-full items-center justify-center rounded-xl bg-teal-600 px-4 py-3 font-semibold text-white shadow-lg shadow-teal-700/20 transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:bg-teal-600/60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Sign in securely"}
          </button>
        </form>

        <p className="mt-7 text-center text-xs leading-5 text-slate-500">
          Your assigned role and geographic access are enforced by Sentinel&apos;s database security policies.
        </p>
      </section>
    </main>
  );
}
