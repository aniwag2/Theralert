import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'staff') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { groupId, activity, description } = await request.json();
    const result = await query(
      'INSERT INTO activities (group_id, activity, description) VALUES (?, ?, ?)',
      [groupId, activity, description]
    );
    return NextResponse.json({ message: 'Activity logged successfully', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('Error logging activity:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  try {
    const activities = await query('SELECT * FROM activities WHERE group_id = ? ORDER BY created_at DESC', [groupId]);
    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error retrieving activities:', error);
    return NextResponse.json({ error: 'Failed to retrieve activities' }, { status: 500 });
  }
}