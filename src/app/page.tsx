import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight">Slate</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Multi-tenant appointment booking admin dashboard for chair-based and
          time-based businesses. One install, many independent organizations,
          zero double-booked chairs.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/sign-in" className={buttonVariants({ size: "lg" })}>
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Create organization
          </Link>
        </div>
      </div>
    </main>
  );
}
