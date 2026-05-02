import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Slate</CardTitle>
          <CardDescription>
            Booking admin for chair-based and time-based businesses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm callbackUrl={callbackUrl} />
          <p className="mt-6 text-sm text-muted-foreground">
            New here?{" "}
            <Link className="underline" href="/sign-up">
              Create an organization
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
