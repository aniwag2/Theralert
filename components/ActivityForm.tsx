// app/components/ActivityForm.tsx
'use client'

import React, { useState } from 'react';
import Clock from 'react-live-clock';
import { Button } from '@/components/ui/button'; // Assuming Button component is available

// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
  isGoal?: boolean; // Added isGoal to the interface
}

interface ActivityFormProps {
  groupId: string | number;
  // Modified onActivityLogged to accept the new activity data and a message, and isGoal
  onActivityLogged: (newActivity: Activity, message: string) => void;
}

export function ActivityForm({ groupId, onActivityLogged }: ActivityFormProps) {
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false); // State for loading indicator
  const [error, setError] = useState<string | null>(null); // State for error messages

  // New state to track if the current submission is for a goal
  const [currentIsGoal, setCurrentIsGoal] = useState(false);

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
        // Pass the currentIsGoal state to the API
        body: JSON.stringify({ groupId, activity, description, isGoal: currentIsGoal }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to log activity');
      }

      const responseData = await response.json();
      const newActivity: Activity = responseData.activity; // Get the full activity object

      setActivity('');
      setDescription('');
      // Pass the new activity, a success message, and the isGoal flag to the parent
      onActivityLogged(newActivity, `${currentIsGoal ? 'Goal' : 'Activity'} logged successfully!`);
    } catch (err: any) {
      console.error('Error logging activity:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false); // Set loading to false after completion
      setCurrentIsGoal(false); // Reset isGoal state after submission
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
              Activity/Goal Name:
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
          <div className="flex space-x-4 mt-4"> {/* Container for the two buttons */}
            <Button
              type="submit"
              onClick={() => setCurrentIsGoal(false)} // Set isGoal to false for activity
              className="flex-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              Log Activity
            </Button>
            <Button
              type="submit"
              onClick={() => setCurrentIsGoal(true)} // Set isGoal to true for goal
              className="flex-1 bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              Log Goal 🎉
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
