"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Tenant } from "../_lib/cspm";

const appLinks = [
  ["/", "Overview"],
  ["/integrations", "Integrations"],
  ["/scans", "Scans"],
  ["/findings", "Findings"],
  ["/compliance", "Compliance"],
  ["/assets", "Assets"],
  ["/settings", "Settings"],
  ["/hierarchy", "Hierarchy"],
  ["/logout", "Logout"]
] as const;

const publicLinks = [
  ["/login", "Login"],
  ["/signup", "Sign up"],
  ["/v1/kb", "Knowledge Base"]
] as const;

export function ConsoleNav({
  tenant,
  tenants,
  onSwitchTenant
}: {
  tenant?: Tenant | null;
  tenants?: Tenant[];
  onSwitchTenant?: (tenantId: string) => void;
}) {
  const pathname = usePathname();
  const links = tenant ? appLinks : publicLinks;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {tenant ? (
        <div className="scopeBanner">
          <strong>Active scope:</strong> {tenant.name} ({tenant.slug})
          <span className="chip">{tenant.role}</span>
          {tenant.via ? <span className="muted">via {tenant.via}</span> : null}
          {tenants && tenants.length > 1 && onSwitchTenant ? (
            <select value={tenant.id} onChange={(e) => onSwitchTenant(e.target.value)}>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      <nav className="subnav">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={`tab ${isActive(href) ? "active" : ""}`}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
