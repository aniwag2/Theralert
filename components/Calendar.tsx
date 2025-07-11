"use client";
import { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Define the structure of an event for react-big-calendar
interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  desc: string; // Description of the activity
  allDay?: boolean;
  isGoal?: boolean; // Added isGoal to CalendarEvent interface
}

// Define the structure of an activity object returned from the API
interface Activity {
  id: number;
  group_id: number;
  activity: string;
  description: string;
  created_at: string; // ISO string date
  isGoal?: boolean; // Added isGoal to Activity interface (from API response)
}

interface ActivityCalendarProps {
  groupId: string | number;
  // Prop to receive a new activity for immediate display
  newActivity?: Activity | null;
  // Prop to trigger a re-fetch of activities (e.g., when a new activity is logged)
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
          end: new Date(activity.created_at),
          desc: activity.description,
          allDay: false,
          isGoal: activity.isGoal, // This will be undefined for old activities, true for new goals
        }));
        setEvents(formattedEvents);
      } else {
        throw new Error('Failed to fetch activities');
      }
    } catch (error) {
      console.error('Error fetching activities:', error);
      // TODO: Show error message to user
    }
  }, [groupId]);

  // Effect to fetch activities initially and when triggerRefresh changes
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities, triggerRefresh]);

  // Effect to add a newly created activity to the calendar immediately
  useEffect(() => {
    if (newActivity) {
      const newEvent: CalendarEvent = {
        id: newActivity.id,
        title: newActivity.activity,
        start: new Date(newActivity.created_at),
        end: newActivity.created_at ? new Date(newActivity.created_at) : new Date(),
        desc: newActivity.description,
        allDay: false,
        isGoal: newActivity.isGoal, // Pass the isGoal flag
      };
      setEvents((prevEvents) => [...prevEvents, newEvent]);
    }
  }, [newActivity]);

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  };

  // Custom event styling based on isGoal property
  const eventPropGetter = useCallback((event: CalendarEvent) => {
    if (event.isGoal) {
      return {
        style: {
          backgroundColor: '#4CAF50', // Green background for goals
          color: 'white',
          borderRadius: '5px',
          border: 'none',
        },
        className: 'rbc-event-goal', // Optional: for additional CSS styling
      };
    }
    return {};
  }, []);

  // Custom event component to add emojis to goal titles
  const CustomEvent = useCallback(({ event }: { event: CalendarEvent }) => {
    return (
      <span>
        {event.isGoal ? `🎉 ${event.title} 🎉` : event.title}
      </span>
    );
  }, []);

  return (
    <div className="p-4 bg-white shadow-md rounded-xl">
      <div style={{ height: '600px' }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          defaultView="month"
          views={['month']}
          toolbar={false}
          onSelectEvent={handleSelectEvent}
          popup
          eventPropGetter={eventPropGetter} // Apply custom styling
          components={{
            event: CustomEvent, // Use custom component for title
          }}
        />
      </div>

      {/* Event Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {selectedEvent?.isGoal ? `🎉 ${selectedEvent?.title} 🎉` : selectedEvent?.title}
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Details for this {selectedEvent?.isGoal ? 'goal' : 'activity'}.
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
              <p className="col-span-3 text-gray-800 whitespace-normal break-words">{selectedEvent?.desc || 'No description provided.'}</p>
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
