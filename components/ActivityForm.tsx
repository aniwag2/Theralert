// app/components/ActivityForm.tsx
'use client'

import React, { useState } from 'react';
import Clock from 'react-live-clock';

interface ActivityFormProps {
  groupId: string | number;
  onActivityLogged: () => void;
}

export function ActivityForm({ groupId, onActivityLogged }: ActivityFormProps) {
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const timestamp = new Date().toISOString();
    
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupId, activity, description, timestamp }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to log activity');
      }

      setActivity('');
      setDescription('');
      onActivityLogged(); // Refresh the calendar after logging activity
    } catch (error) {
      console.error('Error:', error);
      // TODO: Handle error (e.g., show an error message to the user)
    }
  };

  return (
    <div className="w-full max-w-md mx-auto mt-8">
      <div className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
        <div className="mb-4 text-center">
          <Clock
            format={'MMMM Do YYYY, h:mm:ss a'}
            ticking={true}
            className="text-xl font-semibold text-gray-600"
          />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="activity" className="block text-gray-700 text-sm font-bold mb-2">
              Activity:
            </label>
            <input
              type="text"
              id="activity"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
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
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              rows={3}
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
          >
            Log Activity
          </button>
        </form>
      </div>
    </div>
  );
}