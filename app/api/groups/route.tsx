// app/api/groups/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authOptions';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'staff') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { patientEmail, familyEmails } = await req.json();

    // Check if patient exists
    const patients = await query<RowDataPacket[]>(
      'SELECT id FROM users WHERE email = ? AND role = ?',
      [patientEmail, 'patient']
    );
    if (patients.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }
    const patientId = patients[0].id;

    // Create the group
    const result = await query<ResultSetHeader>(
      'INSERT INTO groups (patient_id, staff_id) VALUES (?, ?)',
      [patientId, session.user.id]
    );
    const groupId = result.insertId;

    // Add family members
    for (const email of familyEmails) {
      let familyMemberId;

      // Check if family member exists
      const familyMembers = await query<RowDataPacket[]>(
        'SELECT id FROM users WHERE email = ? AND role = ?',
        [email, 'family']
      );
      if (familyMembers.length === 0) {
        // Create new family member user
        const newFamilyMember = await query<ResultSetHeader>(
          'INSERT INTO users (email, role, name, password) VALUES (?, ?, ?, ?)',
          [email, 'family', 'Family Member', 'temporarypassword'] // You should generate a random password and send an email to the user to set their password
        );
        familyMemberId = newFamilyMember.insertId;
      } else {
        familyMemberId = familyMembers[0].id;
      }

      // Add family member to group
      await query<ResultSetHeader>(
        'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
        [groupId, familyMemberId]
      );
    }

    return NextResponse.json({ message: 'Group created successfully', groupId }, { status: 201 });
  } catch (error) {
    console.error('Error creating group:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let groups;
    if (session.user.role === 'staff') {
      groups = await query<RowDataPacket[]>(
        'SELECT * FROM groups WHERE staff_id = ?',
        [session.user.id]
      );
    } else {
      groups = await query<RowDataPacket[]>(
        `
        SELECT g.* FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.patient_id = ? OR gm.user_id = ?
        `,
        [session.user.id, session.user.id]
      );
    }
    return NextResponse.json(groups);
  } catch (error) {
    console.error('Error retrieving groups:', error);
    return NextResponse.json({ error: 'Failed to retrieve groups' }, { status: 500 });
  }
}
