"use client";

import React, { useState } from 'react';
import Clock from 'react-live-clock';

export default function Log() {
  const [patientId, setPatientId] = useState('');
  const [activity, setActivity] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientId, activity, description }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to log activity');
      }

      const data = await response.json();
      console.log(data.message);
      // TODO: Handle successful submission (e.g., show a success message, clear the form)
    } catch (error) {
      console.error('Error:', error);
      // TODO: Handle error (e.g., show an error message to the user)
    }
  };

  return (
    <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-center mb-4">Patient Activity Log</h1>
      <Clock
        format={'h:mm:ss a'}
        ticking={true}
        className="text-xl font-semibold text-center text-gray-600 mb-6"
      />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="patientId" className="block text-sm font-medium text-gray-700">Patient ID</label>
          <input
            type="text"
            id="patientId"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          />
        </div>
        <div>
          <label htmlFor="activity" className="block text-sm font-medium text-gray-700">Activity</label>
          <select
            id="activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          >
            <option value="">Select an activity</option>
            <option value="meal">Meal</option>
            <option value="medication">Medication</option>
            <option value="exercise">Exercise</option>
            <option value="socialActivity">Social Activity</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            rows={3}
          />
        </div>
        <button 
          type="submit" 
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Log Activity
        </button>
      </form>
    </div>
  );
}