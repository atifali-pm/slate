import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopNav } from "@/components/app/top-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  const memberships = session.user.memberships;
  if (memberships.length === 0) {
    redirect("/sign-up");
  }
  const active =
    memberships.find((m) => m.orgId === session.user.activeOrgId) ??
    memberships[0];
  return (
    <div className="min-h-screen bg-background">
      <TopNav
        active={active}
        memberships={memberships}
        userName={session.user.name ?? session.user.email ?? "User"}
      />
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
