'use client'

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input'; // Assuming you have these UI components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  // State for password change form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<string | null>(null);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);

  // State for account deletion form
  const [deleteConfirmationPassword, setDeleteConfirmationPassword] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteAccountMessage, setDeleteAccountMessage] = useState<string | null>(null);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <p className="text-gray-700">Loading profile...</p>
      </div>
    );
  }

  if (status === 'unauthenticated' || !session?.user) {
    router.push('/login'); // Redirect to login if not authenticated
    return null;
  }

  const user = session.user;

  // --- Password Change Logic ---
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordChangeMessage(null);
    setPasswordChangeError(null);

    // Client-side validation for new password complexity
    const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      setPasswordChangeError('New password must be at least 8 characters long, contain a number and a special character.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordChangeError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
        setPasswordChangeError('New password cannot be the same as the current password.');
        return;
    }

    try {
      const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, email: user.email }),
      });

      if (res.ok) {
        setPasswordChangeMessage('Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        const data = await res.json();
        setPasswordChangeError(data.error || 'Failed to change password. Please try again.');
      }
    } catch (error) {
      console.error('Password change error:', error);
      setPasswordChangeError('An unexpected error occurred during password change.');
    }
  };

  // --- Account Deletion Logic ---
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAccountMessage(null);
    setDeleteAccountError(null);

    if (!showDeleteConfirmation) {
      setShowDeleteConfirmation(true); // Show the confirmation input field
      return;
    }

    try {
      const res = await fetch('/api/profile/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deleteConfirmationPassword, email: user.email }),
      });

      if (res.ok) {
        setDeleteAccountMessage('Account deleted successfully! Redirecting...');
        // Sign out the user and then redirect to login page
        await fetch('/api/auth/signout', { method: 'POST' }); // Manually trigger signout
        router.push('/login');
      } else {
        const data = await res.json();
        setDeleteAccountError(data.error || 'Failed to delete account. Please check your password.');
      }
    } catch (error) {
      console.error('Account deletion error:', error);
      setDeleteAccountError('An unexpected error occurred during account deletion.');
    }
  };


  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-6">
        <Card className="shadow-lg rounded-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-extrabold text-center text-gray-900">Your Profile</CardTitle>
            <CardDescription className="mt-2 text-center text-gray-600">
              Manage your account details and settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium text-gray-700">Name:</label>
              <Input
                type="text"
                value={user.name || 'N/A'}
                readOnly
                className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800"
              />
            </div>
            <div className="flex flex-col space-y-2">
              <label className="text-sm font-medium text-gray-700">Email:</label>
              <Input
                type="email"
                value={user.email || 'N/A'}
                readOnly
                className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-gray-800"
              />
            </div>
          </CardContent>
        </Card>

        {/* Password Change Section */}
        <Card className="shadow-lg rounded-xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-gray-900">Change Password</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordChangeMessage && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{passwordChangeMessage}</span>
              </div>
            )}
            {passwordChangeError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{passwordChangeError}</span>
              </div>
            )}
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="currentPassword">Current Password:</label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="rounded-lg p-2 border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="newPassword">New Password:</label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 chars, num, special)"
                  required
                  className="rounded-lg p-2 border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex flex-col space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="confirmNewPassword">Confirm New Password:</label>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  required
                  className="rounded-lg p-2 border border-gray-300 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-200 transform hover:scale-105"
              >
                Change Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Delete Account Section */}
        <Card className="shadow-lg rounded-xl border-red-300">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center text-red-700">Delete Account</CardTitle>
            <CardDescription className="mt-2 text-center text-gray-600">
              This action cannot be undone. All your data will be permanently removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteAccountMessage && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{deleteAccountMessage}</span>
              </div>
            )}
            {deleteAccountError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
                <span className="block sm:inline">{deleteAccountError}</span>
              </div>
            )}
            <form onSubmit={handleDeleteAccount} className="space-y-4">
              {showDeleteConfirmation && (
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="deletePassword">
                    Type your password to confirm deletion:
                  </label>
                  <Input
                    id="deletePassword"
                    type="password"
                    value={deleteConfirmationPassword}
                    onChange={(e) => setDeleteConfirmationPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="rounded-lg p-2 border border-gray-300 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-all duration-200 transform hover:scale-105"
              >
                {showDeleteConfirmation ? 'Confirm Delete Account' : 'Delete Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
