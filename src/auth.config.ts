import type { NextAuthConfig } from "next-auth";

const PUBLIC_PATHS = new Set(["/", "/sign-in", "/sign-up"]);

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.has(pathname)) return true;
      if (pathname.startsWith("/api/auth")) return true;
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
