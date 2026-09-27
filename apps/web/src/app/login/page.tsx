"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState } from "../_lib/cspm";

export default function LoginPage() {
  const { token, tenant, tenants, switchTenant, login, loading, error, notice } = useCspmState();
  const router = useRouter();
  const lockoutError = typeof error === "string" && /too many failed login attempts/i.test(error);

  useEffect(() => {
    if (!token) return;
    const nextPath = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("next") : null;
    if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
      router.replace(nextPath);
      return;
    }
    router.replace("/");
  }, [token, router]);

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Login</h1></div>
        {tenant ? (
          <span className="badge">Tenant: {tenant.name}</span>
        ) : (
          <div className="authQuickLinks">
            <Link className="chip" href="/login">Login</Link>
            <Link className="chip" href="/signup">Sign up</Link>
          </div>
        )}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />

      {error ? <p className={lockoutError ? "warnText" : "errorText"}>{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <section className="panel">
        <h2>Sign in to your account</h2>
        {!token ? (
          <form className="grid" onSubmit={login}>
            <input required name="email" type="email" placeholder="owner@example.com" autoComplete="email" />
            <input required name="password" type="password" placeholder="Password" autoComplete="current-password" />
            <button disabled={loading}>{loading ? "Working..." : "Login"}</button>
          </form>
        ) : (
          <p className="muted">You are already logged in.</p>
        )}
        <p className="muted">Repeated failed login attempts are temporarily throttled for security.</p>
        {lockoutError ? <p className="warnBanner">Login is temporarily locked due to repeated failed attempts. Wait for the retry window shown above, then try again.</p> : null}
        <p className="muted">No account yet? <Link href="/signup">Create one</Link>.</p>
      </section>
    </main>
  );
}
