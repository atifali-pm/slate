"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import {
  clearActiveOrgCookie,
  writeActiveOrgCookie,
} from "@/lib/auth/active-org";

export async function switchOrgAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const allowed = session.user.memberships.some((m) => m.orgId === orgId);
  if (!allowed) throw new Error("Not a member of that organization.");
  await writeActiveOrgCookie(orgId);
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await clearActiveOrgCookie();
  await signOut({ redirectTo: "/" });
}
