"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCspmState } from "../_lib/cspm";

export default function LogoutPage() {
  const { logout } = useCspmState();
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      await logout();
      if (mounted) setCompleted(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!completed) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Signing out...</h1>
          <p className="muted">Clearing your session.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="panel">
        <h1>Logged out</h1>
        <p className="muted">Your local session has been cleared.</p>
        <Link href="/login" className="tab">Return to login</Link>
      </section>
    </main>
  );
}
