import Link from "@/components/app-link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { AdminForbidden } from "@/components/admin/admin-forbidden";
import { getVerifiedAuthContext } from "@/lib/auth/rbac";
import { getProposalReviewAdminAction } from "@/lib/ai/admin/actions";
import { getProposalCatalogReferences } from "@/lib/ai/admin/readers";
import { ProposalReviewWorkspace } from "./review-workspace";
import styles from "@/components/admin/ai-admin.module.css";

export const dynamic = "force-dynamic";

export default async function ProposalReviewPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const authContext = await getVerifiedAuthContext();
  if (authContext.status !== "READY" || !authContext.permissions.has("catalog:ai_research")) {
    return (
      <AdminForbidden email={authContext.status === "READY" ? authContext.email : undefined} />
    );
  }
  const { proposalId } = await params;
  const [proposalResult, references] = await Promise.all([
    getProposalReviewAdminAction({ proposalId }),
    getProposalCatalogReferences({ authContext }),
  ]);
  if (!proposalResult.success || !proposalResult.data) {
    return (
      <div className={styles.page}>
        <Link href="/admin/products/ai-import" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden="true" /> Volver al asistente
        </Link>
        <div className={styles.errorState} role="alert">
          <AlertTriangle aria-hidden="true" />
          <h1>No se pudo abrir la propuesta</h1>
          <p>{proposalResult.error ?? "La propuesta solicitada no está disponible."}</p>
        </div>
      </div>
    );
  }
  return (
    <ProposalReviewWorkspace
      initialProposal={proposalResult.data}
      brands={references.brands}
      categories={references.categories}
      canApply={authContext.permissions.has("catalog:manage")}
    />
  );
}
