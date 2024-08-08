import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const { patientId, activity, description } = body;

    // TODO: Add validation here

    const result = await query(
      'INSERT INTO activities (patient_id, activity, description) VALUES (?, ?, ?)',
      [patientId, activity, description]
    );

    return NextResponse.json({ message: 'Activity logged successfully', id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('Error logging activity:', error);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const activities = await query('SELECT * FROM activities ORDER BY created_at DESC LIMIT 10');
    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error retrieving activities:', error);
    return NextResponse.json({ error: 'Failed to retrieve activities' }, { status: 500 });
  }
}