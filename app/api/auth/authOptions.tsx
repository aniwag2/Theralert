import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';
import { AuthOptions } from 'next-auth';

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const users = await query(
          'SELECT id, name, email, password, role FROM users WHERE email = ?',
          [credentials.email]
        );
        const user = users[0];

        if (user && await bcrypt.compare(credentials.password, user.password)) {
          return { 
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role; // Ensure `role` is set on the token
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.role = token.role ?? ''; // Use `??` to handle `undefined` safely
        session.user.id = parseInt(token.sub ?? '0', 10); // Use `??` for `token.sub` fallback
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
};