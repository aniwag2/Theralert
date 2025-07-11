'use client'

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ActivityForm } from '@/components/ActivityForm';
import { ActivityCalendar } from '@/components/Calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Assuming you have these UI components
import { CreateGroupForm } from '@/components/CreateGroupForm'; // Import the CreateGroupForm

// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
}

// Define the structure of a group object
interface Group {
  id: number;
  patient_id: number;
  staff_id: number;
  // Add other group properties if they exist in your database
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerType, setBannerType] = useState<'success' | 'error'>('success');
  const [newlyLoggedActivity, setNewlyLoggedActivity] = useState<Activity | null>(null);
  const [refreshCalendar, setRefreshCalendar] = useState(false); // State to trigger full calendar refresh

  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);


  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Function to fetch user's groups
  const fetchGroups = useCallback(async () => {
    if (status !== 'authenticated') return;

    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const response = await fetch('/api/groups');
      if (response.ok) {
        const groups: Group[] = await response.json();
        setUserGroups(groups);
        if (groups.length > 0 && !selectedGroupId) { // Only set default if no group is already selected
          setSelectedGroupId(groups[0].id.toString()); // Select the first group by default
        }
      } else {
        const errorData = await response.json();
        setGroupsError(errorData.error || 'Failed to fetch groups.');
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
      setGroupsError('An unexpected error occurred while fetching groups.');
    } finally {
      setGroupsLoading(false);
    }
  }, [status, selectedGroupId]); // Re-fetch when authentication status changes or selectedGroupId changes

  // Effect to fetch groups initially and when a new group is created
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]); // Dependency on fetchGroups useCallback

  // Handle activity logging from ActivityForm
  const handleActivityLogged = (activity: Activity, message: string) => {
    setNewlyLoggedActivity(activity); // Pass the new activity to the calendar
    setBannerMessage(message);
    setBannerType('success');
    setShowBanner(true);

    // Hide banner after 5 seconds
    setTimeout(() => {
      setShowBanner(false);
      setBannerMessage('');
    }, 5000);

    // Trigger a full refresh of the calendar data after a short delay
    // This ensures consistency, especially if the new activity wasn't immediately picked up
    setTimeout(() => {
      setRefreshCalendar(prev => !prev); // Toggle to trigger useEffect in Calendar
    }, 100);
  };

  // Handle new group creation
  const handleGroupCreated = (message: string) => {
    setBannerMessage(message);
    setBannerType('success');
    setShowBanner(true);
    setTimeout(() => {
      setShowBanner(false);
      setBannerMessage('');
    }, 5000);
    fetchGroups(); // Re-fetch groups to update the dropdown
  };


  if (status === 'loading' || groupsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <p className="text-gray-700">Loading dashboard...</p>
      </div>
    );
  }

  const userRole = session?.user?.role;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <h1 className="text-4xl font-extrabold text-gray-900 text-center mb-8">Dashboard</h1>

      {/* Temporary Debugging: Display User Role */}
      {status === 'authenticated' && (
        <div className="text-center text-sm text-gray-500 mb-4">
          Logged in as: {session?.user?.email} (Role: {userRole || 'N/A'})
        </div>
      )}

      {/* Confirmation Banner */}
      {showBanner && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-lg shadow-lg text-white text-center transition-opacity duration-500 ${
            bannerType === 'success' ? 'bg-green-500' : 'bg-red-500'
          } ${showBanner ? 'opacity-100' : 'opacity-0'}`}
          role="alert"
        >
          {bannerMessage}
        </div>
      )}

      {/* Group Creation Form (only for Staff) - MOVED TO TOP */}
      {userRole === 'staff' && (
        <div className="max-w-md mx-auto mt-8 mb-8 bg-white p-6 rounded-xl shadow-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Create New Group</h2>
          <CreateGroupForm onGroupCreated={handleGroupCreated} />
        </div>
      )}

      {/* Group Selection */}
      <div className="max-w-7xl mx-auto mb-8 bg-white p-6 rounded-xl shadow-md">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Manage Groups</h2>
        {groupsError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <span className="block sm:inline">{groupsError}</span>
          </div>
        )}
        {userGroups.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <label htmlFor="group-select" className="text-gray-700 font-semibold">Select Group for Activities:</label>
            <Select onValueChange={setSelectedGroupId} value={selectedGroupId || ''}>
              <SelectTrigger id="group-select" className="w-[200px] rounded-lg shadow-sm border-gray-300">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg">
                {userGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id.toString()}>
                    Group ID: {group.id} (Patient: {group.patient_id}) {/* You might want to display more meaningful group names */}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-center text-gray-600">No groups found for your account. Create one below!</p>
        )}
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-7xl mx-auto">
        {/* Activity Logging Form */}
        <div className="md:col-span-1">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Log New Activity</h2>
          {selectedGroupId ? (
            <ActivityForm
              groupId={selectedGroupId}
              onActivityLogged={handleActivityLogged}
            />
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-md text-center text-gray-600">
              Please select a group to log activities.
            </div>
          )}
        </div>

        {/* Calendar Display */}
        <div className="md:col-span-1">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Calendar</h2>
          {selectedGroupId ? (
            <ActivityCalendar
              groupId={selectedGroupId}
              newActivity={newlyLoggedActivity}
              triggerRefresh={refreshCalendar}
            />
          ) : (
            <div className="bg-white p-6 rounded-xl shadow-md text-center text-gray-600">
              Please select a group to view the calendar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
