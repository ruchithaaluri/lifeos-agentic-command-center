// ============================================================
// Auth configuration — NextAuth v4 (Credentials)
// ============================================================
// Uses the already-declared next-auth dependency and NEXTAUTH_SECRET;
// no additional auth infrastructure is introduced.
//
// Sessions are JWT-based (no extra session table). The LifeOS `userId`
// is carried in the token so API routes can scope every query.

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@lifeos/database';
import { hashPassword, verifyPassword } from '@/lib/password';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/signin', error: '/signin' },
  providers: [
    CredentialsProvider({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // Always run a hash comparison so a missing user and a wrong password
        // take a similar amount of time.
        const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$00$00');
        if (!user || !user.passwordHash || !ok) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // NextAuth requires these to be async even though they await nothing.
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return Promise.resolve(token);
    },
    session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId;
      }
      return Promise.resolve(session);
    },
  },
};

/** Create a user with a hashed password. Used by the sign-up route. */
export async function createUserWithPassword(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ id: string; email: string; name: string }> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: { email, name: input.name.trim(), passwordHash, demoMode: false },
    select: { id: true, email: true, name: true },
  });
  return user;
}
