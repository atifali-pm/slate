import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { MemberRole } from "@/db/schema";
import { readActiveOrgCookie } from "./active-org";

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

export async function resolveActiveMembership() {
  const session = await requireSession();
  const memberships = session.user.memberships;
  if (memberships.length === 0) return { session, membership: null };
  const cookieOrgId = await readActiveOrgCookie();
  const fromCookie = cookieOrgId
    ? memberships.find((m) => m.orgId === cookieOrgId)
    : undefined;
  return { session, membership: fromCookie ?? memberships[0] };
}

export async function requireOrgScope(): Promise<OrgScope> {
  const { session, membership } = await resolveActiveMembership();
  if (!membership) {
    throw new Error(
      "User has no organization memberships. Sign-up should have created one.",
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
