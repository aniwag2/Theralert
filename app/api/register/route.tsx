import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import nodemailer from 'nodemailer'; // Import nodemailer

// Configure Nodemailer transporter
// Use environment variables for sensitive information
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address from .env.local
    pass: process.env.EMAIL_PASS, // Your generated App Password from .env.local
  },
});

export async function POST(req: Request) {
  try {
    const { name, email, password, role } = await req.json();

    // Server-side password validation
    // This is a crucial security layer, even if client-side validation exists
    const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long, contain a number and a special character.' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    if (existingUser.length > 0) {
      return NextResponse.json({ error: 'User with this email already exists.' }, { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const result = await query<ResultSetHeader>(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );

    // Send welcome/verification email
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address
      to: email, // Recipient address
      subject: 'Welcome to Theralert! Account Verification',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #4CAF50;">Welcome to Theralert, ${name}!</h2>
          <p>Thank you for registering. Your account has been successfully created.</p>
          <p>We're excited to have you with us!</p>
          <p>Best regards,</p>
          <p>The Theralert Team</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 0.9em; color: #777;">This is an automated email, please do not reply.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${email}`);
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      // Optionally, you might still register the user but log the email error
      // Or decide to return an error to the client if email sending is critical for registration.
      // For now, we'll proceed with user registration but log the email error.
    }

    return NextResponse.json({ message: 'User registered successfully and email sent.', userId: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed due to an internal server error.' }, { status: 500 });
  }
}
