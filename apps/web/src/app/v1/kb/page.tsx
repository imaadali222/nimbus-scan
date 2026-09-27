import Link from "next/link";

const cards = [
  { href: "/v1/kb/access-requirements", title: "Access requirements", desc: "Responsibility matrix and minimum values to collect before onboarding." },
  { href: "/v1/kb/aws", title: "AWS setup guide", desc: "Click-path onboarding for AssumeRole, single and multi-account flows." },
  { href: "/v1/kb/azure", title: "Azure setup guide", desc: "Service principal creation, Graph permissions, and subscription role assignments." },
  { href: "/v1/kb/gcp", title: "GCP setup guide", desc: "Service account + role assignment + key handling aligned with Prowler auth model." },
  { href: "/v1/kb/kubernetes", title: "Kubernetes setup guide", desc: "ServiceAccount/RBAC + kubeconfig context steps for KSPM onboarding." },
  { href: "/v1/kb/m365", title: "M365 setup guide", desc: "Entra app registration and Graph permissions for Microsoft 365 posture scanning." },
  { href: "/v1/kb/github", title: "GitHub setup guide", desc: "Organization token setup for GitHub security posture checks." },
  { href: "/v1/kb/mongodbatlas", title: "MongoDB Atlas setup guide", desc: "Atlas API key setup and organization scope mapping." },
  { href: "/v1/kb/oraclecloud", title: "Oracle Cloud setup guide", desc: "OCI API key onboarding with tenancy/user OCID mapping." },
  { href: "/v1/kb/alibabacloud", title: "Alibaba Cloud setup guide", desc: "RAM access key reference onboarding and account scope mapping." },
  { href: "/v1/kb/cloudflare", title: "Cloudflare setup guide", desc: "Account token creation and read-only permission scope." },
  { href: "/v1/kb/openstack", title: "OpenStack setup guide", desc: "Keystone auth onboarding and project/domain mapping." }
];

export default function GuidesIndexPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Public knowledge base</p>
          <h1>Integration setup guides</h1>
          <p className="muted">No login required. These pages are written for MSP operators and end-customer cloud admins to onboard tenants without guessing.</p>
        </div>
        <div className="authQuickLinks">
          <Link className="chip" href="/login">Login</Link>
          <Link className="chip" href="/signup">Sign up</Link>
        </div>
      </header>

      <section className="panel">
        <h2>Who should do what</h2>
        <p className="checkItem">- End customer cloud admin: performs cloud-side setup in the provider console.</p>
        <p className="checkItem">- MSP operator: validates connection in SaaS, saves integration, queues first scan, and verifies findings.</p>
        <p className="checkItem">- Platform team: keeps worker scanner runtime healthy (Prowler/Kubescape binaries or images).</p>
      </section>

      <section className="panel">
        <h2>Recommended onboarding order</h2>
        <p className="checkItem">1. Review <Link href="/v1/kb/access-requirements">Access requirements</Link>.</p>
        <p className="checkItem">2. Follow the provider-specific setup guide for your integration type.</p>
        <p className="checkItem">3. In SaaS, create integration and run connection test where available.</p>
        <p className="checkItem">4. Queue first scan and confirm findings appear in dashboard pages.</p>
      </section>

      <section className="panel">
        <div className="list">
          {cards.map((card) => (
            <Link key={card.href} href={card.href} className="row" style={{ textDecoration: "none" }}>
              <span>
                <strong>{card.title}</strong>
                <br />
                <span className="muted">{card.desc}</span>
              </span>
              <span className="chip">Open</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
