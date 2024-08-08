// app/api/groups/route.ts
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]/route'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session || session.user.role !== 'staff') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { patientEmail } = await req.json()

    // Check if patient exists
    const patients = await query('SELECT id FROM users WHERE email = ? AND role = ?', [patientEmail, 'patient'])
    if (patients.length === 0) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }
    const patientId = patients[0].id

    // Create the group
    const result = await query(
      'INSERT INTO groups (patient_id, staff_id) VALUES (?, ?)',
      [patientId, session.user.id]
    )

    return NextResponse.json({ message: 'Group created successfully', groupId: result.insertId }, { status: 201 })
  } catch (error) {
    console.error('Error creating group:', error)
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    let groups
    if (session.user.role === 'staff') {
      groups = await query('SELECT * FROM groups WHERE staff_id = ?', [session.user.id])
    } else {
      groups = await query(`
        SELECT g.* FROM groups g
        LEFT JOIN group_members gm ON g.id = gm.group_id
        WHERE g.patient_id = ? OR gm.user_id = ?
      `, [session.user.id, session.user.id])
    }
    return NextResponse.json(groups)
  } catch (error) {
    console.error('Error retrieving groups:', error)
    return NextResponse.json({ error: 'Failed to retrieve groups' }, { status: 500 })
  }
}