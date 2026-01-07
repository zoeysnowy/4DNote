
import type { Event } from '@frontend/types';
import { formatTimeForStorage, parseLocalTimeString, parseLocalTimeStringOrNull } from './timeUtils';
import { hasTaskFacet } from './eventFacets';

export interface CheckState {
	isChecked: boolean;
	lastChecked?: string;
	lastUnchecked?: string;
}

function lastOf(values: string[] | undefined): string | undefined {
	if (!Array.isArray(values) || values.length === 0) return undefined;
	return values[values.length - 1];
}

function latestOf(values: string[] | undefined): string | undefined {
	if (!Array.isArray(values) || values.length === 0) return undefined;

	let best = values[0];
	let bestTime = parseLocalTimeStringOrNull(best)?.getTime() ?? null;

	for (let i = 1; i < values.length; i++) {
		const value = values[i];
		if (typeof value !== 'string' || value.trim() === '') continue;

		const valueTime = parseLocalTimeStringOrNull(value)?.getTime() ?? null;
		if (valueTime !== null) {
			if (bestTime === null || valueTime > bestTime) {
				best = value;
				bestTime = valueTime;
			}
			continue;
		}

		// Both are unparsable: fallback to lexicographic max (best effort).
		if (bestTime === null && value > best) {
			best = value;
		}
	}

	return best;
}

/**
 * Resolve current check state from checked/unchecked timestamp arrays.
 * Pure function; does not write back.
 */
export function resolveCheckState(event: Pick<Event, 'checked' | 'unchecked'>): CheckState {
	// The arrays are append-only in most flows, but can be reordered by merges/imports.
	const lastChecked = latestOf(event.checked ?? undefined) ?? lastOf(event.checked);
	const lastUnchecked = latestOf(event.unchecked ?? undefined) ?? lastOf(event.unchecked);

	let isChecked = false;
	if (lastChecked) {
		if (!lastUnchecked) {
			isChecked = true;
		} else {
			const checkedTime = parseLocalTimeStringOrNull(lastChecked)?.getTime() ?? null;
			const uncheckedTime = parseLocalTimeStringOrNull(lastUnchecked)?.getTime() ?? null;
			if (checkedTime !== null && uncheckedTime !== null) {
				isChecked = checkedTime > uncheckedTime;
			} else {
				// Best-effort fallback for legacy strings.
				isChecked = lastChecked > lastUnchecked;
			}
		}
	}

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
		'checkType' | 'startTime' | 'endTime' | 'createdAt' | 'checked' | 'unchecked'
	>
): CalendarDateRange {
	const hasStart = !!event.startTime;
	const hasEnd = !!event.endTime;

	// Task date-only rendering: tasks without explicit startTime are anchored to a day.
	// This includes:
	// - no-time tasks: {startTime: undefined, endTime: undefined}
	// - deadline tasks: {startTime: undefined, endTime: '...'}
	if (!hasStart && hasTaskFacet(event as Event)) {
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

	// Time-based events (and tasks with startTime): fill missing side with the other side
	// before falling back to createdAt/now.
	const fallback = formatTimeForStorage(new Date());
	const startSource = event.startTime || event.endTime || event.createdAt || fallback;
	const endSource = event.endTime || event.startTime || event.createdAt || fallback;
	const start = parseLocalTimeString(startSource);
	const end = parseLocalTimeString(endSource);
	return { start, end, kind: 'time-based' };
}

