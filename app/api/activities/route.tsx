import { NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authOptions';

// POST method to log an activity
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  // Ensure session and user role validation
  if (!session || !session.user || session.user.role !== 'staff') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { groupId, activity, description } = await request.json();

    // Execute the INSERT query and type result as ResultSetHeader
    const result = await query<ResultSetHeader>(
      'INSERT INTO activities (group_id, activity, description) VALUES (?, ?, ?)',
      [groupId, activity, description]
    );

    // Return success response with the newly inserted record ID
    return NextResponse.json(
      { message: 'Activity logged successfully', id: result.insertId },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error logging activity:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

// GET method to retrieve activities
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  // Ensure session and user validation
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  try {
    // Retrieve activities based on groupId
    const activities = await query(
      'SELECT * FROM activities WHERE group_id = ? ORDER BY created_at DESC',
      [groupId]
    );

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error retrieving activities:', error);
    return NextResponse.json({ error: 'Failed to retrieve activities' }, { status: 500 });
  }
}
