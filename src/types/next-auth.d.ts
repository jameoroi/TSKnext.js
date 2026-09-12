import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      authProvider?: string;
      providerAccountId?: string;
      authEmailVerified?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    authProvider?: string;
    providerAccountId?: string;
    authEmailVerified?: boolean;
  }
}
