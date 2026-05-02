import { cookies } from "next/headers";

export const ACTIVE_ORG_COOKIE = "slate.active_org";

export async function readActiveOrgCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

export async function writeActiveOrgCookie(orgId: string) {
  const jar = await cookies();
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearActiveOrgCookie() {
  const jar = await cookies();
  jar.delete(ACTIVE_ORG_COOKIE);
}
