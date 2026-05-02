"use client";

import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { switchOrgAction } from "@/app/(app)/actions";

type Membership = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: string;
};

export function OrgSwitcher({
  active,
  memberships,
}: {
  active: Membership;
  memberships: Membership[];
}) {
  const [pending, startTransition] = useTransition();
  function pick(orgId: string) {
    if (orgId === active.orgId) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("orgId", orgId);
      await switchOrgAction(fd);
    });
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        <span className="font-medium">{active.orgName}</span>
        <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs uppercase tracking-wide text-muted-foreground">
          {active.role}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch organization</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.orgId}
            onSelect={() => pick(m.orgId)}
            className="flex items-center justify-between"
          >
            <span>{m.orgName}</span>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {m.role}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
