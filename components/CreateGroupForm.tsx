// app/components/CreateGroupForm.tsx
'use client'

import { useState } from 'react'

interface CreateGroupFormProps {
  onGroupCreated: () => void
}

export function CreateGroupForm({ onGroupCreated }: CreateGroupFormProps) {
  const [patientEmail, setPatientEmail] = useState('')
  const [familyEmails, setFamilyEmails] = useState([''])
  const [error, setError] = useState('')

  const handleAddFamilyMember = () => {
    setFamilyEmails([...familyEmails, ''])
  }

  const handleRemoveFamilyMember = (index: number) => {
    const newFamilyEmails = familyEmails.filter((_, i) => i !== index)
    setFamilyEmails(newFamilyEmails)
  }

  const handleFamilyEmailChange = (index: number, value: string) => {
    const newFamilyEmails = [...familyEmails]
    newFamilyEmails[index] = value
    setFamilyEmails(newFamilyEmails)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
  
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientEmail, familyEmails: familyEmails.filter(email => email !== '') }),
      });
  
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create group');
      }
  
      setPatientEmail('');
      setFamilyEmails(['']);
      onGroupCreated();
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('An unknown error occurred');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 p-4 bg-white rounded shadow">
      <h3 className="text-lg font-semibold mb-4">Create New Group</h3>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <div className="mb-4">
        <label htmlFor="patientEmail" className="block text-sm font-medium text-gray-700">
          Patient Email
        </label>
        <input
          type="email"
          id="patientEmail"
          value={patientEmail}
          onChange={(e) => setPatientEmail(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
          required
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Family Member Emails</label>
        {familyEmails.map((email, index) => (
          <div key={index} className="flex mt-2">
            <input
              type="email"
              value={email}
              onChange={(e) => handleFamilyEmailChange(index, e.target.value)}
              className="flex-grow rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
            <button
              type="button"
              onClick={() => handleRemoveFamilyMember(index)}
              className="ml-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={handleAddFamilyMember}
          className="mt-2 px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Add Family Member
        </button>
      </div>
      <button
        type="submit"
        className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
      >
        Create Group
      </button>
    </form>
  )
}