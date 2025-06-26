import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function PUT(req: Request) {
  try {
    const { email, currentPassword, newPassword } = await req.json();

    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch user by email to verify current password
    const users = await query<RowDataPacket[]>(
      'SELECT id, password FROM users WHERE email = ?',
      [email]
    );

    const user = users[0];

    if (!user) {
      // User not found (though this shouldn't happen for an authenticated user)
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 2. Compare provided current password with stored hashed password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid current password' }, { status: 401 });
    }

    // 3. Server-side validation for new password complexity
    const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters long, contain a number and a special character.' },
        { status: 400 }
      );
    }

    // 4. Ensure new password is not the same as the current password
    const isNewPasswordSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isNewPasswordSameAsCurrent) {
        return NextResponse.json({ error: 'New password cannot be the same as the current password.' }, { status: 400 });
    }

    // 5. Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // 6. Update the user's password in the database
    const result = await query<ResultSetHeader>(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedNewPassword, user.id]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 });
  } catch (error) {
    console.error('Password change API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
