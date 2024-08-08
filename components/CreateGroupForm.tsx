// app/components/CreateGroupForm.tsx
'use client'

import { useState } from 'react'

interface CreateGroupFormProps {
  onGroupCreated: () => void
}

export function CreateGroupForm({ onGroupCreated }: CreateGroupFormProps) {
  const [patientEmail, setPatientEmail] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ patientEmail }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create group')
      }

      setPatientEmail('')
      onGroupCreated()
    } catch (error) {
      setError(error.message)
    }
  }

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
      <button
        type="submit"
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
      >
        Create Group
      </button>
    </form>
  )
}