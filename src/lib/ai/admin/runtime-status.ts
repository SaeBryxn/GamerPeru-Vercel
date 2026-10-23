"use server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requirePermission } from "@/lib/auth/rbac";
import { requireResearchFetchUserAgent, requireResearchRuntimeConfig } from "../research/config";
import { getAdminAiSettings } from "./readers";
export async function inspectAutofillRuntimeAdminAction() {
  const actor = await requirePermission("ai:manage_credentials");
  const settings = await getAdminAiSettings({ authContext: actor });
  const profiles = settings.profiles.filter(
    (profile) =>
      ["PRODUCT_RESEARCH_FAST", "PRODUCT_RESEARCH_DEEP"].includes(profile.profileKey) &&
      profile.isEnabled &&
      profile.researchExecutionSupported
  );
  const providerReady = profiles.some((profile) => {
    const provider = settings.providers.find((item) => item.id === profile.providerId);
    return (
      provider?.isEnabled &&
      (provider.providerKey === "cloudflare" || provider.credential?.status === "ACTIVE")
    );
  });
  let searchReady = false;
  let fetchReady = false;
  let bindingReady = false;
  try {
    requireResearchRuntimeConfig();
    searchReady = true;
  } catch {
    /* Return status, never secrets. */
  }
  try {
    requireResearchFetchUserAgent();
    fetchReady = true;
  } catch {
    /* Missing identifiable crawler. */
  }
  try {
    const env = getCloudflareContext().env as unknown as { AI?: { run?: unknown } };
    bindingReady = typeof env.AI?.run === "function";
  } catch {
    /* Local Node has no binding. */
  }
  const configured = (key: string) => {
    const value = process.env[key]?.trim() ?? "";
    return Boolean(value && !/placeholder|changeme/i.test(value));
  };
  return {
    profileReady: profiles.length > 0,
    providerReady,
    searchReady,
    fetchReady,
    bindingReady,
    backgroundConfigured: configured("INNGEST_EVENT_KEY") && configured("INNGEST_SIGNING_KEY"),
  };
}
