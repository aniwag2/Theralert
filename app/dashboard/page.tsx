'use client'

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ActivityForm } from '@/components/ActivityForm';
import { ActivityCalendar } from '@/components/Calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateGroupForm } from '@/components/CreateGroupForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
  isGoal?: boolean; // Added isGoal to Activity interface
}

// Define the updated structure of a group object to include patient_name
interface Group {
  id: number;
  patient_id: number;
  staff_id: number;
  patient_name: string; // Added patient_name
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

  // State for group deletion confirmation
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null); // Now stores the actual group object
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);


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
        // If no group is selected, or the previously selected group was deleted, select the first available group
        if (groups.length > 0) {
          // If selectedGroupId is null or the selected group no longer exists, default to the first group
          if (!selectedGroupId || !groups.some(g => g.id.toString() === selectedGroupId)) {
            setSelectedGroupId(groups[0].id.toString());
          }
        } else {
          setSelectedGroupId(null); // No groups available
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
  }, [status, selectedGroupId]);

  // Effect to fetch groups initially and when a new group is created
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Handle activity logging from ActivityForm
  const handleActivityLogged = (activity: Activity, message: string) => {
    // Pass the entire activity object (which now includes isGoal) to the calendar
    setNewlyLoggedActivity(activity);
    setBannerMessage(message);
    setBannerType('success');
    setShowBanner(true);

    setTimeout(() => {
      setShowBanner(false);
      setBannerMessage('');
    }, 5000);

    setTimeout(() => {
      setRefreshCalendar(prev => !prev);
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

  // Trigger confirmation dialog for the currently selected group
  const handleInitiateDeleteSelectedGroup = () => {
    if (selectedGroupId) {
      const group = userGroups.find(g => g.id.toString() === selectedGroupId);
      if (group) {
        setGroupToDelete(group);
        setDeleteConfirmationInput(''); // Clear previous input
        setDeleteError(null); // Clear previous errors
        setIsDeleteDialogOpen(true);
      }
    } else {
      setDeleteError('Please select a group to delete.');
      // Optionally show a temporary banner for this error
      setBannerMessage('Please select a group to delete.');
      setBannerType('error');
      setShowBanner(true);
      setTimeout(() => { setShowBanner(false); setBannerMessage(''); }, 5000);
    }
  };


  // Handle actual group deletion
  const handleDeleteGroup = async () => {
    if (!groupToDelete || deleteConfirmationInput !== `DELETE GROUP ${groupToDelete.id}`) {
      setDeleteError(`Please type &quot;DELETE GROUP ${groupToDelete?.id}&quot; to confirm.`);
      return;
    }

    setDeleteError(null); // Clear any previous error
    try {
      const response = await fetch(`/api/groups/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: groupToDelete.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete group.');
      }

      setBannerMessage(`Group &quot;${groupToDelete.patient_name}&quot; (ID: ${groupToDelete.id}) deleted successfully!`);
      setBannerType('success');
      setShowBanner(true);
      setTimeout(() => { setShowBanner(false); setBannerMessage(''); }, 5000);

      setIsDeleteDialogOpen(false); // Close the dialog
      setGroupToDelete(null); // Clear the group to delete
      fetchGroups(); // Re-fetch groups to update the list and dropdown
    } catch (error: any) {
      console.error('Error deleting group:', error);
      setDeleteError(error.message || 'An unexpected error occurred during deletion.');
    }
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

      {/* Group Selection and Delete Button */}
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
              <SelectTrigger id="group-select" className="w-[250px] rounded-lg shadow-sm border-gray-300">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent className="rounded-lg shadow-lg">
                {userGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id.toString()} className="flex items-center justify-between">
                    <span>Patient: {group.patient_name} (ID: {group.id})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {userRole === 'staff' && (
              <Button
                variant="destructive"
                onClick={handleInitiateDeleteSelectedGroup}
                disabled={!selectedGroupId}
                className="ml-4 px-4 py-2 rounded-lg"
              >
                Delete Selected Group
              </Button>
            )}
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

      {/* Delete Group Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-700">Confirm Group Deletion</DialogTitle>
            <DialogDescription className="text-gray-600">
              This action cannot be undone. This will permanently delete group &quot;<strong>{groupToDelete?.patient_name}</strong>&quot; (ID: {groupToDelete?.id}) and all associated activities.
              <br/><br/>
              To confirm, please type &quot;<strong>DELETE GROUP {groupToDelete?.id}</strong>&quot; in the box below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {deleteError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <span className="block sm:inline">{deleteError}</span>
              </div>
            )}
            <Input
              type="text"
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder={`Type "DELETE GROUP ${groupToDelete?.id}" to confirm`}
              className="w-full rounded-lg border-gray-300 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} className="px-4 py-2 rounded-lg">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteGroup}
              disabled={deleteConfirmationInput !== `DELETE GROUP ${groupToDelete?.id}`}
              className="px-4 py-2 rounded-lg"
            >
              Delete Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
