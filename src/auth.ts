import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { JWT as _JWT } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import type { MemberRole } from "@/db/schema";
import { authConfig } from "@/auth.config";

type SessionMembership = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: MemberRole;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      memberships: SessionMembership[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    memberships?: SessionMembership[];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function loadMemberships(userId: string): Promise<SessionMembership[]> {
  const rows = await db
    .select({
      orgId: organizations.id,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId));
  return rows.map((row) => ({
    orgId: row.orgId,
    orgSlug: row.orgSlug,
    orgName: row.orgName,
    role: row.role,
  }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const found = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            hashedPassword: users.hashedPassword,
          })
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        const user = found[0];
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.hashedPassword);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.memberships = await loadMemberships(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.memberships = token.memberships ?? [];
      return session;
    },
  },
});
