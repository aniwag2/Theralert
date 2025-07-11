// app/components/ActivityForm.tsx
'use client'

import React, { useState } from 'react';
import Clock from 'react-live-clock';

// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
}

interface ActivityFormProps {
  groupId: string | number;
  // Modified onActivityLogged to accept the new activity data and a message
  onActivityLogged: (newActivity: Activity, message: string) => void;
}

export function ActivityForm({ groupId, onActivityLogged }: ActivityFormProps) {
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false); // New state for loading indicator
  const [error, setError] = useState<string | null>(null); // New state for error messages

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); // Set loading to true on submission
    setError(null); // Clear previous errors

    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupId, activity, description }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to log activity');
      }

      const responseData = await response.json();
      const newActivity: Activity = responseData.activity; // Get the full activity object

      setActivity('');
      setDescription('');
      // Pass the new activity and a success message to the parent
      onActivityLogged(newActivity, 'Activity logged successfully!');
    } catch (err: any) {
      console.error('Error logging activity:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false); // Set loading to false after completion
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <div className="bg-white shadow-md rounded-xl px-8 pt-6 pb-8 mb-4">
        <div className="mb-4 text-center">
          <Clock
            format={'MMMM Do YYYY, h:mm:ss a'}
            ticking={true}
            className="text-xl font-semibold text-gray-600"
          />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          <div>
            <label htmlFor="activity" className="block text-gray-700 text-sm font-bold mb-2">
              Activity:
            </label>
            <input
              type="text"
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline transition-all duration-200 focus:ring-2 focus:ring-blue-500 rounded-lg"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="description" className="block text-gray-700 text-sm font-bold mb-2">
              Description:
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline transition-all duration-200 focus:ring-2 focus:ring-blue-500 rounded-lg"
              rows={3}
              required
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? 'Logging...' : 'Log Activity'}
          </button>
        </form>
      </div>
    </div>
  );
}
