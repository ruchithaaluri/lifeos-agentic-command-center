// Type augmentation: NextAuth's default Session.user has no `id`, but the
// LifeOS user id is carried in the JWT so API routes can scope every query.
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}

export {};
