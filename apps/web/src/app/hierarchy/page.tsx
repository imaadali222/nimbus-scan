"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ConsoleNav } from "../_components/ConsoleNav";
import { useCspmState } from "../_lib/cspm";

export default function HierarchyPage() {
  const { tenant, tenants, hierarchyNodes, hierarchyLinks, switchTenant } = useCspmState();

  const tree = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const link of hierarchyLinks) {
      const list = childrenByParent.get(link.parentTenantId) ?? [];
      list.push(link.childTenantId);
      childrenByParent.set(link.parentTenantId, list);
    }

    const childSet = new Set(hierarchyLinks.map((l) => l.childTenantId));
    const roots = hierarchyNodes.filter((n) => !childSet.has(n.id));

    return { roots, childrenByParent };
  }, [hierarchyNodes, hierarchyLinks]);

  const byId = useMemo(() => new Map(hierarchyNodes.map((n) => [n.id, n])), [hierarchyNodes]);

  function renderNode(nodeId: string, depth = 0) {
    const node = byId.get(nodeId);
    if (!node) return null;
    const children = tree.childrenByParent.get(nodeId) ?? [];

    return (
      <div key={nodeId} style={{ marginLeft: depth * 18 }}>
        <div className="row" style={{ marginBottom: 6 }}>
          <span>
            <strong>{node.name}</strong> <span className="muted">({node.slug})</span>
          </span>
          <button onClick={() => switchTenant(node.id)}>Switch scope</button>
          <Link href="/integrations" className="chip">Open</Link>
        </div>
        {children.map((childId) => renderNode(childId, depth + 1))}
      </div>
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div><p className="eyebrow">NSCA</p><h1>Tenant hierarchy</h1></div>
        {tenant ? <span className="badge">Tenant: {tenant.name}</span> : <span className="badge muted">Not signed in</span>}
      </header>
      <ConsoleNav tenant={tenant} tenants={tenants} onSwitchTenant={switchTenant} />

      <section className="panel">
        <h2>MSP/customer tree</h2>
        {tree.roots.length === 0 ? <p className="muted">No hierarchy links yet.</p> : null}
        {tree.roots.map((root) => renderNode(root.id))}
      </section>
    </main>
  );
}
