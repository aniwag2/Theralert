"use client";
import { useState, useEffect } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';

interface ActivityCalendarProps {
  groupId: string | number
}

const localizer = momentLocalizer(moment);

export function ActivityCalendar({ groupId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const response = await fetch(`/api/activities?groupId=${groupId}`);
        if (response.ok) {
          const activities = await response.json();
          const formattedEvents = activities.map(activity => ({
            title: activity.activity,
            start: new Date(activity.created_at),
            end: new Date(activity.created_at),
            desc: activity.description,
          }));
          setEvents(formattedEvents);
        } else {
          throw new Error('Failed to fetch activities');
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
      }
    };

    fetchActivities();
  }, [groupId]);

  return (
    <div style={{ height: '500px' }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
      />
    </div>
  );
}