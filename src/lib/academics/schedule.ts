export interface ScheduleSlot {
  day: string
  start: string
  end: string
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function slotsOverlap(a: ScheduleSlot, b: ScheduleSlot): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end
}

export function findScheduleConflicts<T extends { id: string; schedule: ScheduleSlot[] }>(
  newSlots: ScheduleSlot[],
  existing: T[],
  excludeId?: string
): T[] {
  return existing.filter(
    (e) => e.id !== excludeId && e.schedule.some((s) => newSlots.some((n) => slotsOverlap(n, s)))
  )
}
