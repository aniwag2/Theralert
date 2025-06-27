import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authOptions'; // Adjust path if necessary based on your project structure

export async function DELETE(req: Request) {
  try {
    // Ensure the user is authenticated before proceeding
    const session = await getServerSession(authOptions);

    if (!session || !session.user || !session.user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { password } = await req.json(); // Only need the password for confirmation

    if (!password) {
      return NextResponse.json({ error: 'Password is required to confirm deletion' }, { status: 400 });
    }

    const userEmail = session.user.email; // Get email from the authenticated session

    // 1. Fetch user by email to verify the password
    const users = await query<RowDataPacket[]>(
      'SELECT id, password FROM users WHERE email = ?',
      [userEmail]
    );

    const user = users[0];

    if (!user) {
      // This case should ideally not happen if session is valid, but for safety
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. Compare provided password with stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Incorrect password for account deletion' }, { status: 401 });
    }

    // 3. Delete the user from the database
    const result = await query<ResultSetHeader>(
      'DELETE FROM users WHERE id = ?',
      [user.id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    // Optionally, you might want to manually invalidate the session here as well,
    // although the client-side signOut call will also handle it.
    // For NextAuth.js, signing out on the client after deletion is usually sufficient.

    return NextResponse.json({ message: 'Account deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Account deletion API error:', error);
    return NextResponse.json({ error: 'Internal server error during account deletion' }, { status: 500 });
  }
}
