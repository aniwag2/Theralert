import { NextResponse } from 'next/server';
import { query, ResultSetHeader } from '@/lib/db';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authOptions';
import nodemailer from 'nodemailer';
import { RowDataPacket } from 'mysql2';

// Define a custom interface for group members that extends RowDataPacket
interface GroupMemberRow extends RowDataPacket {
  email: string;
  role: string;
}

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// POST method to log an activity or goal and send notifications
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Expecting 'isGoal' field: boolean (true for goal, false for activity)
    // This 'isGoal' flag is ONLY for email differentiation, NOT stored in DB.
    const { groupId, activity, description, isGoal = false } = await request.json();

    // 1. Insert the new activity (no 'type' column needed as per request)
    const insertResult = await query<ResultSetHeader>(
      'INSERT INTO activities (group_id, activity, description) VALUES (?, ?, ?)',
      [groupId, activity, description]
    );

    const newActivityId = insertResult.insertId;

    // 2. Fetch the complete new activity record (still no 'type' column)
    const newRecords = await query<RowDataPacket[]>(
      'SELECT id, group_id, activity, description, created_at FROM activities WHERE id = ?',
      [newActivityId]
    );

    const newRecord = newRecords[0];

    if (!newRecord) {
      throw new Error('Failed to retrieve newly created activity.');
    }

    // 3. Fetch all members (patient and family) for the given group
    const groupMembers = await query<GroupMemberRow[]>(
      `
      SELECT u.email, u.name, u.role
      FROM users u
      JOIN \`groups\` g ON u.id = g.patient_id
      WHERE g.id = ? AND u.role = 'patient'
      UNION
      SELECT u.email, u.name, u.role
      FROM users u
      JOIN group_members gm ON u.id = gm.user_id
      WHERE gm.group_id = ? AND u.role = 'family'
      `,
      [groupId, groupId]
    );

    const recipientEmails = groupMembers
      .map(member => member.email)
      .filter((email, index, self) => email && self.indexOf(email) === index);

    if (recipientEmails.length === 0) {
      console.warn(`No valid recipients found for group ${groupId}. Record logged but no emails sent.`);
    } else {
      // 4. Customize email content based on isGoal flag
      let emailSubject: string;
      let emailHtml: string;

      if (isGoal) {
        emailSubject = `🎉 Theralert: Goal Achieved for your Group! 🎉`;
        emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #28a745;">Congratulations! A Goal Has Been Completed!</h2>
            <p>Great news! A goal has been achieved for your group:</p>
            <p><strong>Goal:</strong> ${newRecord.activity}</p>
            <p><strong>Description:</strong> ${newRecord.description}</p>
            <p><strong>Time of Completion:</strong> ${new Date(newRecord.created_at).toLocaleString()}</p>
            <p>Keep up the amazing work! Check your Theralert dashboard for more details.</p>
            <p>Best regards,</p>
            <p>The Theralert Team</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.9em; color: #777;">This is an automated email, please do not reply.</p>
          </div>
        `;
      } else { // isGoal === false (regular activity)
        emailSubject = `Theralert: New Activity Logged for your Group!`;
        emailHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #4CAF50;">New Activity Update!</h2>
            <p>A new activity has been logged for your group:</p>
            <p><strong>Activity:</strong> ${newRecord.activity}</p>
            <p><strong>Description:</strong> ${newRecord.description}</p>
            <p><strong>Time:</strong> ${new Date(newRecord.created_at).toLocaleString()}</p>
            <p>Check your Theralert dashboard for more details.</p>
            <p>Best regards,</p>
            <p>The Theralert Team</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.9em; color: #777;">This is an automated email, please do not reply.</p>
          </div>
        `;
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: recipientEmails.join(', '),
        subject: emailSubject,
        html: emailHtml,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`${isGoal ? 'Goal completion' : 'Activity'} notification email sent to group ${groupId} recipients.`);
      } catch (emailError) {
        console.error(`Error sending ${isGoal ? 'goal' : 'activity'} notification email:`, emailError);
      }
    }

    // Return success response with the newly inserted record and the isGoal flag
    return NextResponse.json(
      { message: `${isGoal ? 'Goal' : 'Activity'} logged successfully and notifications sent.`, activity: { ...newRecord, isGoal } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error logging record or sending notification:', error);
    return NextResponse.json({ error: `Failed to log record or send notification` }, { status: 500 });
  }
}

// GET method to retrieve activities (no 'type' column needed as per request)
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get('groupId');

  try {
    // Select activities without the 'type' column
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
