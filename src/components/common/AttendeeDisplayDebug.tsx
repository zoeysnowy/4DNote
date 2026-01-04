/**
 * AttendeeDisplay 调试版本
 * 添加了大量 console.log 来帮助排查问题
 */

import React, { useState, useEffect, useRef } from 'react';
import { Contact, Event } from '@frontend/types';
import { ContactService } from '@backend/ContactService';
import { EventService } from '@backend/EventService';
import { ContactPreviewCard } from './ContactPreviewCard';
import { FullContactModal } from './FullContactModal';
import AttendeeIcon from '@frontend/assets/icons/Attendee.svg';
import './AttendeeDisplay.css';

interface AttendeeDisplayProps {
  event: Event;
  currentUserEmail?: string;
  onChange?: (attendees: Contact[], organizer?: Contact) => void;
}

export const AttendeeDisplayDebug: React.FC<AttendeeDisplayProps> = ({
  event,
  currentUserEmail = '',
  onChange,
}) => {
  console.log('[AttendeeDisplay] Component mounted/updated', { event, currentUserEmail });
  
  const [participants, setParticipants] = useState<Contact[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  
  useEffect(() => {
    console.log('[AttendeeDisplay] Initializing participants from event:', event);
    const newParticipants: Contact[] = [];
    
    if (event.organizer) {
      console.log('[AttendeeDisplay] Adding organizer:', event.organizer);
      newParticipants.push(event.organizer);
    } else if (event.attendees?.some(a => a.email)) {
      console.log('[AttendeeDisplay] No organizer, creating "我" entry');
      newParticipants.push({
        id: 'current-user',
        name: '我',
        email: currentUserEmail,
        is4DNote: true,
      });
    }
    
    if (event.attendees) {
      console.log('[AttendeeDisplay] Adding attendees:', event.attendees);
      newParticipants.push(...event.attendees);
    }
    
    console.log('[AttendeeDisplay] Final participants:', newParticipants);
    setParticipants(newParticipants);
  }, [event, currentUserEmail]);

  const handleClick = (index: number) => {
    console.log('[AttendeeDisplay] ===== CLICK EVENT TRIGGERED =====');
    console.log('[AttendeeDisplay] Clicked participant index:', index);
    console.log('[AttendeeDisplay] Clicked participant:', participants[index]);
    setSearchMode(true);
    console.log('[AttendeeDisplay] Search mode set to true');
  };

  if (participants.length === 0) {
    console.log('[AttendeeDisplay] No participants, returning null');
    return null;
  }

  console.log('[AttendeeDisplay] Rendering with participants:', participants);

  return (
    <div className="attendee-display" style={{ border: '2px solid red' }}>
      <img src={AttendeeIcon} alt="参会人" className="attendee-icon" />
      
      <div className="attendee-list">
        {participants.map((person, index) => (
          <span
            key={index}
            className={`attendee-name ${index === 0 ? 'organizer' : ''} ${person.email ? 'has-email' : ''}`}
            onClick={(e) => {
              console.log('[AttendeeDisplay] onClick handler called for index:', index);
              console.log('[AttendeeDisplay] Event object:', e);
              e.stopPropagation();
              handleClick(index);
            }}
            onMouseEnter={() => console.log('[AttendeeDisplay] Mouse entered:', person.name)}
            onMouseLeave={() => console.log('[AttendeeDisplay] Mouse left:', person.name)}
            style={{ border: '1px solid blue', display: 'inline-block', padding: '2px' }}
          >
            {person.name}
            {index < participants.length - 1 && '; '}
          </span>
        ))}
      </div>

      {searchMode && (
        <div style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          background: 'yellow', 
          padding: '20px',
          border: '2px solid green',
          zIndex: 9999
        }}>
          搜索模式已激活！
          <button onClick={() => {
            console.log('[AttendeeDisplay] Closing search mode');
            setSearchMode(false);
          }}>
            关闭
          </button>
        </div>
      )}
    </div>
  );
};
