import { DecisionWorkspace } from "@/components/product/decision-workspace";
import { resolveWebMCPRegistrationMode } from "@/webmcp";

export default function DecisionDemoPage() {
  const registrationMode = resolveWebMCPRegistrationMode(
    process.env.VERCEL_ENV,
    process.env.RATIFLOW_WEBMCP_ABLATION,
  );
  return <DecisionWorkspace registrationMode={registrationMode} />;
}
