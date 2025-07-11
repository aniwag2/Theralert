import { NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authOptions';

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);

  // Only allow staff to delete groups
  if (!session || session.user.role !== 'staff') {
    return NextResponse.json({ error: 'Unauthorized. Only staff can delete groups.' }, { status: 401 });
  }

  try {
    const { groupId } = await req.json();

    if (!groupId) {
      return NextResponse.json({ error: 'Group ID is required for deletion.' }, { status: 400 });
    }

    // Start a transaction for atomicity (optional but recommended for complex deletions)
    // For simplicity, we'll do direct queries here, assuming your `query` function handles connections well.
    // In a real-world app, you might want explicit transaction management if your `query` doesn't
    // support it implicitly.

    // 1. Delete associated activities first to avoid foreign key constraints
    await query<ResultSetHeader>(
      'DELETE FROM activities WHERE group_id = ?',
      [groupId]
    );
    console.log(`Deleted activities for group ID: ${groupId}`);

    // 2. Delete associated group members
    await query<ResultSetHeader>(
      'DELETE FROM group_members WHERE group_id = ?',
      [groupId]
    );
    console.log(`Deleted group members for group ID: ${groupId}`);

    // 3. Delete the group itself
    const result = await query<ResultSetHeader>(
      'DELETE FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: 'Group not found or already deleted.' }, { status: 404 });
    }

    console.log(`Group ID: ${groupId} deleted successfully.`);
    return NextResponse.json({ message: 'Group deleted successfully.' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting group:', error);
    return NextResponse.json({ error: 'Failed to delete group due to an internal server error.' }, { status: 500 });
  }
}
