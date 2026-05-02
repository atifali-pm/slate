"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut, unstable_update } from "@/auth";

export async function switchOrgAction(formData: FormData) {
  const orgId = String(formData.get("orgId") ?? "");
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const allowed = session.user.memberships.some((m) => m.orgId === orgId);
  if (!allowed) throw new Error("Not a member of that organization.");
  await unstable_update({ user: { activeOrgId: orgId } });
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
