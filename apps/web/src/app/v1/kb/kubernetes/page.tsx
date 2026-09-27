"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export default function KubernetesGuidePage() {
  const [clusterName, setClusterName] = useState("");
  const [kubeconfigPath, setKubeconfigPath] = useState("/Users/you/.kube/config");
  const [context, setContext] = useState("");

  const payload = useMemo(() => ({
    name: "Prod Kubernetes",
    provider: "KUBERNETES",
    isActive: true,
    config: { clusterName, kubeconfigPath, context }
  }), [clusterName, kubeconfigPath, context]);
  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const [copied, setCopied] = useState(false);

  async function copyPayload() {
    await navigator.clipboard.writeText(payloadText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="shell">
      <section className="panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Public guide</p>
            <h1>Kubernetes integration setup</h1>
            <p className="muted">KSPM onboarding flow using kubeconfig context and read-only ServiceAccount RBAC.</p>
          </div>
          <Link href="/v1/kb" className="tab">All guides</Link>
        </header>

        <h2>Who does what</h2>
        <p className="checkItem">- End customer cluster admin: creates ServiceAccount and RBAC, validates kubeconfig context.</p>
        <p className="checkItem">- MSP operator: enters cluster metadata in SaaS and confirms first KSPM scan result.</p>
      </section>

      <section className="panel">
        <h2>Cluster onboarding click path</h2>
        <p className="checkItem">1. Verify local/admin access: <span className="mono">kubectl config get-contexts</span>.</p>
        <p className="checkItem">2. Apply dedicated Prowler RBAC resources in cluster namespace.</p>
        <p className="checkItem">3. Create ServiceAccount token and bind it to context used for scanning.</p>
        <p className="checkItem">4. Confirm read-only access works with target context before adding integration.</p>
        <p className="checkItem">5. Store kubeconfig securely and provide path/context values to SaaS integration.</p>
      </section>

      <section className="panel">
        <h2>Reference commands</h2>
        <pre className="codeBlock">{[
          "kubectl apply -f kubernetes/prowler-sa.yaml",
          "kubectl apply -f kubernetes/prowler-role.yaml",
          "kubectl apply -f kubernetes/prowler-rolebinding.yaml",
          "kubectl create token prowler-sa -n prowler-ns --duration=24h",
          "kubectl config set-credentials prowler-sa --token=<SA_TOKEN>",
          "kubectl config set-context <CONTEXT_NAME> --user=prowler-sa"
        ].join("\n")}</pre>
      </section>

      <section className="panel">
        <h2>Map Kubernetes values to SaaS fields</h2>
        <div className="tableWrap">
          <table>
            <thead><tr><th>SaaS field</th><th>Where to get it</th><th>Example</th></tr></thead>
            <tbody>
              <tr><td>clusterName</td><td>Cluster naming convention / inventory</td><td className="mono">prod-eks-us-east-1</td></tr>
              <tr><td>kubeconfigPath</td><td>Secure path on worker host</td><td className="mono">/etc/cspm/kubeconfigs/prod.yaml</td></tr>
              <tr><td>context</td><td><span className="mono">kubectl config get-contexts</span></td><td className="mono">prod-context</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Prowler alignment references</h2>
        <p className="checkItem">- <a href="https://docs.prowler.com/projects/prowler-open-source/en/latest/user-guide/providers/kubernetes/getting-started-k8s/" target="_blank" rel="noreferrer">Getting started with Kubernetes in Prowler</a></p>
        <p className="checkItem">- <a href="https://github.com/prowler-cloud/prowler/tree/master/kubernetes" target="_blank" rel="noreferrer">Prowler Kubernetes manifest examples</a></p>
      </section>

      <section className="panel">
        <h2>Generate Kubernetes config</h2>
        <div className="grid">
          <input value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder="Cluster name" />
          <input value={kubeconfigPath} onChange={(e) => setKubeconfigPath(e.target.value)} placeholder="kubeconfig path" />
          <input value={context} onChange={(e) => setContext(e.target.value)} placeholder="context" />
        </div>
        <button type="button" onClick={copyPayload}>{copied ? "Copied" : "Copy payload"}</button>
        <pre className="codeBlock">{payloadText}</pre>
      </section>
    </main>
  );
}
