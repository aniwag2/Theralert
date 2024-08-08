"use client";

import React, { useState } from 'react';
import Clock from 'react-live-clock';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">Patient Activity Log</CardTitle>
        <Clock
          format={'h:mm:ss a'}
          ticking={true}
          className="text-xl font-semibold text-center text-gray-600"
        />
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="patientId" className="block text-sm font-medium text-gray-700">Patient ID</label>
            <Input
              type="text"
              id="patientId"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="activity" className="block text-sm font-medium text-gray-700">Activity</label>
            <Select onValueChange={setActivity} required>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meal">Meal</SelectItem>
                <SelectItem value="medication">Medication</SelectItem>
                <SelectItem value="exercise">Exercise</SelectItem>
                <SelectItem value="socialActivity">Social Activity</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full">Log Activity</Button>
        </form>
      </CardContent>
    </Card>
  );
}