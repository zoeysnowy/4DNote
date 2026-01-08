import { EventService } from '@backend/EventService';
import { TimeHub } from '@backend/TimeHub';
import { formatTimeForStorage } from '@frontend/utils/timeUtils';

describe('TimeHub basic set/get/subscribe', () => {
  beforeEach(() => {
    EventService.initialize(null);
  });

  test('setEventTime updates event and notifies subscribers', async () => {
    // Seed an event
    const seeded = await EventService.createEvent({
      title: 'Test',
      source: 'local:timelog',
      startTime: formatTimeForStorage(new Date(2025, 9, 20, 9, 0, 0)),
      endTime: formatTimeForStorage(new Date(2025, 9, 20, 10, 0, 0)),
      isAllDay: false,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    } as any, true);
    expect(seeded.success).toBe(true);
    const eventId = seeded.event!.id!;

    // Subscribe
    let calls = 0;
    const unsub = TimeHub.subscribe(eventId, () => { calls += 1; });

    // Update via TimeHub
    const start = '2025-10-21 09:30:00';
    const end = '2025-10-21 10:30:00';
    const result = await TimeHub.setEventTime(eventId, { start, end });
    expect(result.success).toBe(true);

    // Snapshot reflects update
    const snap = TimeHub.getSnapshot(eventId);
    expect(snap.start).toBe(start);
    expect(snap.end).toBe(end);
    expect(snap.timeSpec).toBeTruthy();

    // Subscriber called at least once
    expect(calls).toBeGreaterThan(0);

    unsub();
  });

  test('setTimerWindow updates locally without persisting legacy isTimer', async () => {
    const seeded = await EventService.createEvent({
      title: 'Timer Event',
      source: 'local:timelog',
      startTime: formatTimeForStorage(new Date(2025, 9, 20, 9, 0, 0)),
      endTime: formatTimeForStorage(new Date(2025, 9, 20, 9, 15, 0)),
      isAllDay: false,
      tags: [],
      createdAt: formatTimeForStorage(new Date()),
      updatedAt: formatTimeForStorage(new Date())
    } as any, true);
    expect(seeded.success).toBe(true);
    const eventId = seeded.event!.id!;

    const start = '2025-10-21 10:00:00';
    const end = '2025-10-21 10:05:00';
    const res = await TimeHub.setTimerWindow(eventId, { start, end });
    expect(res.success).toBe(true);

    const ev = await EventService.getEventById(eventId);
    expect(ev?.startTime).toBe(start);
    expect(ev?.endTime).toBe(end);
    expect((ev as any)?.timeSpec?.source).toBe('timer');
    expect((ev as any)?.isTimer).not.toBe(true);
  });
});
