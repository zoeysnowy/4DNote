
import type { Event } from '../types';
import { formatTimeForStorage, parseLocalTimeString } from './timeUtils';

export interface CheckState {
	isChecked: boolean;
	lastChecked?: string;
	lastUnchecked?: string;
}

function lastOf(values: string[] | undefined): string | undefined {
	if (!Array.isArray(values) || values.length === 0) return undefined;
	return values[values.length - 1];
}

/**
 * Resolve current check state from checked/unchecked timestamp arrays.
 * Pure function; does not write back.
 */
export function resolveCheckState(event: Pick<Event, 'checked' | 'unchecked'>): CheckState {
	const lastChecked = lastOf(event.checked);
	const lastUnchecked = lastOf(event.unchecked);
	const isChecked = !!lastChecked && (!lastUnchecked || lastChecked > lastUnchecked);
	return { isChecked, lastChecked, lastUnchecked };
}

export interface ResolveTaskAnchorOptions {
	/**
	 * If true, checked tasks anchor to the completion day (lastChecked).
	 * If false, always anchor to createdAt.
	 */
	preferCompletionDayWhenChecked?: boolean;

	/** Fallback timestamp when all sources are missing. */
	fallbackToNow?: boolean;
}

/**
 * Resolve the anchor timestamp used to place a no-time Task onto a calendar date.
 * This is display-only derived logic (similar to TitleResolver).
 */
export function resolveTaskAnchorTimestamp(
	task: Pick<Partial<Event>, 'createdAt' | 'endTime' | 'checked' | 'unchecked'>,
	options?: ResolveTaskAnchorOptions
): string | undefined {
	const preferCompletionDayWhenChecked = options?.preferCompletionDayWhenChecked !== false;
	const { isChecked, lastChecked } = resolveCheckState(task);

	if (preferCompletionDayWhenChecked && isChecked && lastChecked) return lastChecked;
	// For unchecked tasks, prefer explicit planned endTime if user set it.
	if (!isChecked && task.endTime) return task.endTime;
	if (task.createdAt) return task.createdAt;

	return options?.fallbackToNow ? formatTimeForStorage(new Date()) : undefined;
}

export interface CalendarDateRange {
	start: Date;
	end: Date;
	kind: 'task-date-only' | 'time-based';
}

/**
 * Resolve the Date range for TimeCalendar rendering.
 * - For no-time tasks: use an anchor date (createdAt or completion day) and clamp to 00:00.
 * - For time-based events: use startTime/endTime (fallback to createdAt).
 *
 * Important: This never mutates or persists startTime/endTime.
 */
export function resolveCalendarDateRange(
	event: Pick<
		Partial<Event>,
		'isTask' | 'startTime' | 'endTime' | 'createdAt' | 'checked' | 'unchecked'
	>
): CalendarDateRange {
	const hasStart = !!event.startTime;
	const hasEnd = !!event.endTime;

	if ((!hasStart || !hasEnd) && event.isTask) {
		const anchor = resolveTaskAnchorTimestamp(event, {
			preferCompletionDayWhenChecked: true,
			fallbackToNow: true
		})!;
		const anchorDate = parseLocalTimeString(anchor);
		const start = new Date(anchorDate);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		return { start, end, kind: 'task-date-only' };
	}

	const fallback = formatTimeForStorage(new Date());
	const start = parseLocalTimeString(event.startTime || event.createdAt || fallback);
	const end = parseLocalTimeString(event.endTime || event.createdAt || fallback);
	return { start, end, kind: 'time-based' };
}

