import { NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authOptions';
import nodemailer from 'nodemailer'; // Import nodemailer

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST method to log an activity and send notifications
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { groupId, activity, description } = await request.json();

    // 1. Insert the new activity
    const insertResult = await query<ResultSetHeader>(
      'INSERT INTO activities (group_id, activity, description) VALUES (?, ?, ?)',
      [groupId, activity, description]
    );

    const newActivityId = insertResult.insertId;

    // 2. Fetch the complete new activity record
    const newActivities = await query(
      'SELECT id, group_id, activity, description, created_at FROM activities WHERE id = ?',
      [newActivityId]
    );

    const newActivity = newActivities[0];

    if (!newActivity) {
      throw new Error('Failed to retrieve newly created activity.');
    }

    // 3. Fetch all members (patient and family) for the given group
    // This query joins groups, users (for patient), and group_members (for family)
    const groupMembers = await query<{ email: string, role: string }[]>(
      `
      SELECT u.email, u.role
      FROM users u
      JOIN \`groups\` g ON u.id = g.patient_id
      WHERE g.id = ? AND u.role = 'patient'
      UNION
      SELECT u.email, u.role
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ? AND u.role = 'family'
      `,
      [groupId, groupId] // Pass groupId twice for the UNION query
    );

    // Filter out unique emails and ensure valid recipients
    const recipientEmails = groupMembers
      .map(member => member.email)
      .filter((email, index, self) => email && self.indexOf(email) === index); // Ensure unique and non-empty emails

    if (recipientEmails.length === 0) {
      console.warn(`No valid recipients found for group ${groupId}. Activity logged but no emails sent.`);
    } else {
      // 4. Send notification email to all recipients
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmails.join(', '), // Comma-separated list of recipients
        subject: `Theralert: New Activity Logged for your Group!`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #4CAF50;">New Activity Update!</h2>
            <p>A new activity has been logged for your group:</p>
            <p><strong>Activity:</strong> ${newActivity.activity}</p>
            <p><strong>Description:</strong> ${newActivity.description}</p>
            <p><strong>Time:</strong> ${new Date(newActivity.created_at).toLocaleString()}</p>
            <p>Check your Theralert dashboard for more details.</p>
            <p>Best regards,</p>
            <p>The Theralert Team</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.9em; color: #777;">This is an automated email, please do not reply.</p>
          </div>
        `,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Activity notification email sent to group ${groupId} recipients.`);
      } catch (emailError) {
        console.error('Error sending activity notification email:', emailError);
        // Log error but don't fail the activity creation if email fails
      }
    }

    // Return success response with the newly inserted record
    return NextResponse.json(
      { message: 'Activity logged successfully and notifications sent.', activity: newActivity },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error logging activity or sending notification:', error);
    return NextResponse.json({ error: 'Failed to log activity or send notification' }, { status: 500 });
  }
}

// GET method to retrieve activities
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  try {
    const activities = await query(
      'SELECT id, group_id, activity, description, created_at FROM activities WHERE group_id = ? ORDER BY created_at DESC',
      [groupId]
    );

    return NextResponse.json(activities);
  } catch (error) {
    console.error('Error retrieving activities:', error);
    return NextResponse.json({ error: 'Failed to retrieve activities' }, { status: 500 });
  }
}
