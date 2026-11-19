export interface CalEvent { title: string; start: Date; end: Date; description: string; location: string; isAllDay: boolean; uid: string }
/** Events from .ics text, recurring ones expanded a year ahead. Events that ended before the start of `from`'s day are dropped. */
export function parseICS(icsContent: string, from?: Date): CalEvent[];
export function generateRecurringInstances(event: CalEvent, rrule: string, startDate: Date, endDate: Date, exceptionDates?: Date[], from?: Date): CalEvent[];
/** Events on the local calendar day of `day`, earliest first. */
export function eventsOn(events: CalEvent[], day?: Date): CalEvent[];
export function timeLabel(d: Date): string;
export function cleanICSText(text: string): string;
