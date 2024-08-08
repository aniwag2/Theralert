"use client";
import { useState } from 'react';
import { useSession } from 'next-auth/react';

interface ActivityFormProps {
  groupId: string | number
}

export function ActivityForm({ groupId }) {
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');
  const { data: session } = useSession();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (session?.user.role !== 'staff') {
      alert('Only staff members can log activities');
      return;
    }
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, activity, description }),
      });
      if (response.ok) {
        setActivity('');
        setDescription('');
        // Optionally, refresh the activity list or calendar
      } else {
        throw new Error('Failed to log activity');
      }
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" value={activity} onChange={(e) => setActivity(e.target.value)} required />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
      <button type="submit">Log Activity</button>
    </form>
  );
}