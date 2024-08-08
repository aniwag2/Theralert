// app/dashboard/page.tsx
'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { ActivityForm } from '@/components/ActivityForm'
import { ActivityCalendar } from '@/components/Calendar'
import { CreateGroupForm } from '@/components/CreateGroupForm'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState<string | number | null>(null)

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/groups')
      if (response.ok) {
        const fetchedGroups = await response.json()
        setGroups(fetchedGroups)
        if (fetchedGroups.length > 0 && !selectedGroup) {
          setSelectedGroup(fetchedGroups[0].id)
        }
      } else {
        throw new Error('Failed to fetch groups')
      }
    } catch (error) {
      console.error('Error fetching groups:', error)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchGroups()
    }
  }, [status])

  if (status === 'loading') return <div>Loading...</div>
  if (status === 'unauthenticated') return <div>Please log in to access the dashboard.</div>

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <p className="mb-4">Logged in as: {session?.user?.email} (Role: {session?.user?.role})</p>
      
      {session?.user?.role === 'staff' && (
        <CreateGroupForm onGroupCreated={fetchGroups} />
      )}

      {groups.length > 0 ? (
        <div>
          <select 
            value={selectedGroup?.toString() || ''}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="mb-4 p-2 border rounded"
          >
            {groups.map(group => (
              <option key={group.id} value={group.id}>{`Group ${group.id}`}</option>
            ))}
          </select>
          
          {session?.user?.role === 'staff' && selectedGroup && (
            <ActivityForm groupId={selectedGroup} onActivityLogged={() => {
              // Refresh the calendar when a new activity is logged
              const calendarComponent = document.querySelector('.rbc-calendar');
              if (calendarComponent) {
                calendarComponent.dispatchEvent(new Event('refreshCalendar'));
              }
            }} />
          )}
          
          {selectedGroup && (
            <ActivityCalendar groupId={selectedGroup} />
          )}
        </div>
      ) : (
        <p>No groups available. {session?.user?.role === 'staff' ? 'Create a group to get started.' : 'Please contact an administrator.'}</p>
      )}
    </div>
  )
}