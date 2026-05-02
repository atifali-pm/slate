import Link from "next/link";
import { Button } from "@/components/ui/button";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { signOutAction } from "@/app/(app)/actions";

type Membership = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: string;
};

export function TopNav({
  active,
  memberships,
  userName,
}: {
  active: Membership;
  memberships: Membership[];
  userName: string;
}) {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-lg font-semibold">
            Slate
          </Link>
          <OrgSwitcher active={active} memberships={memberships} />
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {userName}
          </span>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
