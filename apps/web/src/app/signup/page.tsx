"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConsoleNav } from "../_components/ConsoleNav";
import { PASSWORD_POLICY_HINT, useCspmState } from "../_lib/cspm";

export default function SignupPage() {
  const { token, tenant, tenants, switchTenant, register, loading, error, notice } = useCspmState();
  const router = useRouter();

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
        <div><p className="eyebrow">NSCA</p><h1>Sign up</h1></div>
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

      {error ? <p className="errorText">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}

      <section className="panel">
        <h2>Create tenant owner</h2>
        {!token ? (
          <>
            <form className="grid" onSubmit={register}>
              <input required name="email" type="email" placeholder="owner@example.com" autoComplete="email" />
              <input
                required
                name="password"
                type="password"
                placeholder="Password"
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
              />
              <input required name="tenantName" placeholder="Acme Corp" />
              <button disabled={loading}>{loading ? "Working..." : "Create account"}</button>
            </form>
            <p className="muted">{PASSWORD_POLICY_HINT}</p>
            <p className="muted">Tenant slug is generated automatically from tenant name.</p>
          </>
        ) : (
          <p className="muted">You are already signed in.</p>
        )}
        <p className="muted">Already have an account? <Link href="/login">Login</Link>.</p>
      </section>
    </main>
  );
}
