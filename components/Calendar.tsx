"use client";
import { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'; // Assuming these exist
import { Button } from '@/components/ui/button'; // Assuming Button component is available

// Define the structure of an event for react-big-calendar
interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  desc: string; // Description of the activity
  allDay?: boolean;
}

// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
}

interface ActivityCalendarProps {
  groupId: string | number;
  // Prop to receive a new activity for immediate display
  newActivity?: Activity | null;
  // Prop to trigger a re-fetch of activities (e.g., when a new activity is logged)
  // This is a more robust way to ensure data consistency
  triggerRefresh?: boolean;
}

const localizer = momentLocalizer(moment);

export function ActivityCalendar({ groupId, newActivity, triggerRefresh }: ActivityCalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Function to fetch activities from the API
  const fetchActivities = useCallback(async () => {
    if (!groupId) return; // Don't fetch if no groupId is selected

    try {
      const response = await fetch(`/api/activities?groupId=${groupId}`);
      if (response.ok) {
        const activities: Activity[] = await response.json();
        const formattedEvents: CalendarEvent[] = activities.map((activity: Activity) => ({
          id: activity.id,
          title: activity.activity,
          start: new Date(activity.created_at),
          // For activities that represent a point in time, start and end can be the same
          end: new Date(activity.created_at),
          desc: activity.description,
          allDay: false, // Activities usually have a specific time
        }));
        setEvents(formattedEvents);
      } else {
        throw new Error('Failed to fetch activities');
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      // TODO: Show error message to user
    }
  }, [groupId]); // Dependency on groupId

  // Effect to fetch activities initially and when triggerRefresh changes
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities, triggerRefresh]); // Re-fetch when fetchActivities changes or triggerRefresh is true

  // Effect to add a newly created activity to the calendar immediately
  useEffect(() => {
    if (newActivity) {
      const newEvent: CalendarEvent = {
        id: newActivity.id,
        title: newActivity.activity,
        start: new Date(newActivity.created_at),
        end: newActivity.created_at ? new Date(newActivity.created_at) : new Date(), // Ensure end date is valid
        desc: newActivity.description,
        allDay: false,
      };
      setEvents((prevEvents) => [...prevEvents, newEvent]);
    }
  }, [newActivity]); // Dependency on newActivity

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  return (
    <div className="p-4 bg-white shadow-md rounded-xl">
      <div style={{ height: '600px' }}> {/* Increased height for better visibility */}
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          defaultView="month" // Set default view to month
          views={['month']} // Only allow month view
          toolbar={false} // Hide the toolbar (navigation buttons)
          onSelectEvent={handleSelectEvent} // Make events clickable
          popup // Enable the default event popup (though we'll use our own modal)
          // Event component for custom rendering if needed (optional for now)
          // components={{
          //   event: CustomEvent,
          // }}
        />
      </div>

      {/* Event Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">{selectedEvent?.title}</DialogTitle>
            <DialogDescription className="text-gray-600">
              Details for this activity.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium text-gray-700">Time:</label>
              <p className="col-span-3 text-gray-800">
                {selectedEvent?.start ? moment(selectedEvent.start).format('MMMM Do YYYY, h:mm A') : 'N/A'}
              </p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium text-gray-700">Description:</label>
              <p className="col-span-3 text-gray-800">{selectedEvent?.desc || 'No description provided.'}</p>
            </div>
          </div>
          <Button onClick={handleCloseModal} className="w-full bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 transform hover:scale-105">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
