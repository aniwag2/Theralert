// Import NextAuth and the separated authOptions
import NextAuth from 'next-auth';
import { authOptions } from '../authOptions';

// Initialize NextAuth with the provided authOptions
const handler = NextAuth(authOptions);

// Export the HTTP methods
export { handler as GET, handler as POST };