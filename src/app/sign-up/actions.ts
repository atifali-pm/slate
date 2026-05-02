"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signIn } from "@/auth";

const signUpSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1, "Your name is required."),
  orgName: z.string().min(1, "Organization name is required."),
  orgSlug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, hyphens."),
});

export type SignUpResult = { error?: string };

export async function signUpAction(
  _prev: SignUpResult | null,
  formData: FormData,
): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    orgName: formData.get("orgName"),
    orgSlug: formData.get("orgSlug"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { email, password, name, orgName, orgSlug } = parsed.data;

  const existingEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail.length) return { error: "Email already registered." };
  const existingSlug = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  if (existingSlug.length) return { error: "Org slug already taken." };

  const hashed = await bcrypt.hash(password, 10);
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, hashedPassword: hashed, name })
      .returning({ id: users.id });
    const [org] = await tx
      .insert(organizations)
      .values({ name: orgName, slug: orgSlug })
      .returning({ id: organizations.id });
    await tx.insert(memberships).values({
      userId: user.id,
      orgId: org.id,
      role: "owner",
    });
  });

  await signIn("credentials", {
    email,
    password,
    redirectTo: "/dashboard",
  });
  return {};
}
