import Link from "next/link";

export default function AccessRequirementsPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Public knowledge base</p>
          <h1>Cloud access requirements</h1>
          <p className="muted">Use this as a pre-flight checklist before onboarding MSP customers in SaaS.</p>
        </div>
        <Link href="/v1/kb" className="tab">All guides</Link>
      </header>

      <section className="panel">
        <h2>Responsibility matrix (MSP model)</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Task</th><th>End customer</th><th>MSP operator</th><th>SaaS output</th></tr></thead>
            <tbody>
              <tr><td>Cloud credential setup</td><td>Creates role/app/service account/RBAC</td><td>Provides guidance and template values</td><td>Reusable integration payload</td></tr>
              <tr><td>Secret handling</td><td>Stores secret in their vault/manager</td><td>Collects only secret reference</td><td>No raw secret persisted in UI forms</td></tr>
              <tr><td>Connection validation</td><td>Approves test attempt if needed</td><td>Runs test, resolves auth errors</td><td>Verified integration in tenant scope</td></tr>
              <tr><td>First scan and triage</td><td>Reviews initial findings</td><td>Queues scan and validates dashboard data</td><td>Findings/assets/compliance populated</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Minimum values to collect per provider</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Provider</th><th>Required</th><th>Recommended</th></tr></thead>
            <tbody>
              <tr><td>AWS</td><td>Account ID(s), Role ARN</td><td>External ID, regions list, standard role name across accounts</td></tr>
              <tr><td>Azure</td><td>Tenant ID, Subscription ID, Client ID, Client Secret reference</td><td>Reader + ProwlerRole assignments, Graph app permissions</td></tr>
              <tr><td>GCP</td><td>Project ID, Service account credential reference</td><td>Viewer + Service Usage Consumer + custom ProwlerRole permissions</td></tr>
              <tr><td>Kubernetes</td><td>Cluster name, kubeconfig path, context</td><td>Dedicated ServiceAccount + read-only RBAC bindings</td></tr>
              <tr><td>M365</td><td>Tenant ID, Client ID, Client Secret reference</td><td>Graph app permissions + admin consent workflow</td></tr>
              <tr><td>GitHub</td><td>Token reference</td><td>Organization scope + read-only token permissions</td></tr>
              <tr><td>MongoDB Atlas</td><td>Organization ID, public/private key references</td><td>Project-level security read permissions</td></tr>
              <tr><td>Oracle Cloud</td><td>Tenancy OCID, User OCID, fingerprint, private key reference</td><td>Scoped API key + region mapping</td></tr>
              <tr><td>Alibaba Cloud</td><td>AccessKey ID/Secret references</td><td>RAM policy scoping + account ID + region</td></tr>
              <tr><td>Cloudflare</td><td>Account ID, API token reference</td><td>Read-only security policy/token scopes</td></tr>
              <tr><td>OpenStack</td><td>Auth URL, username, password reference, project name</td><td>Domain scoping + least-privilege role mapping</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Operator checklist before creating integration in SaaS</h2>
        <p className="checkItem">- Confirm cloud-side identity exists and has read/security permissions required by Prowler for that provider.</p>
        <p className="checkItem">- Confirm secret values are stored outside SaaS (vault/secret manager) and only references are shared.</p>
        <p className="checkItem">- Confirm scanner runtime is healthy on worker host (preflight checks pass).</p>
        <p className="checkItem">- Confirm tenant scope is selected correctly (MSP parent vs sub-customer) before saving integration.</p>
      </section>

      <section className="panel">
        <h2>Scanner runtime prerequisites (Prowler and Kubescape)</h2>
        <p className="checkItem">- Runtime model chosen: Docker image based or local binary based</p>
        <p className="checkItem">- Prowler available and executable on worker host</p>
        <p className="checkItem">- Kubescape available and executable on worker host</p>
        <p className="checkItem">- Worker has network egress + IAM/OIDC path needed to assume target cloud roles</p>
      </section>
    </main>
  );
}
