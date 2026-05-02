import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { MemberRole } from "@/db/schema";

export type OrgScope = {
  userId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: MemberRole;
};

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  return session;
}

export async function requireOrgScope(): Promise<OrgScope> {
  const session = await requireSession();
  const activeOrgId = session.user.activeOrgId;
  if (!activeOrgId) {
    throw new Error(
      "No active organization. User must belong to an org before reaching org-scoped routes.",
    );
  }
  const membership = session.user.memberships.find(
    (m) => m.orgId === activeOrgId,
  );
  if (!membership) {
    throw new Error(
      "Active org_id is not in user's memberships. Session is stale or tampered.",
    );
  }
  return {
    userId: session.user.id,
    orgId: membership.orgId,
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    role: membership.role,
  };
}
