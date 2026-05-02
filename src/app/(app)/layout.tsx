import { redirect } from "next/navigation";
import { resolveActiveMembership } from "@/lib/auth/scope";
import { TopNav } from "@/components/app/top-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, membership } = await resolveActiveMembership();
  const memberships = session.user.memberships;
  if (!membership) {
    redirect("/sign-up");
  }
  const active = membership;
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
