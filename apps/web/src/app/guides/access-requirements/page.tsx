import { redirect } from "next/navigation";

export default function AccessRequirementsRedirectPage() {
  redirect("/v1/kb/access-requirements");
}
