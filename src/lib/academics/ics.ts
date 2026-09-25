import type { TimetableEntry } from "@/components/academics/weekly-timetable"

const DAY_TO_ICS: Record<string, string> = {
  Mon: "MO",
  Tue: "TU",
  Wed: "WE",
  Thu: "TH",
  Fri: "FR",
  Sat: "SA",
  Sun: "SU",
}

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function firstOccurrence(semesterStart: Date, day: string): Date {
  const target = DAY_INDEX[day]
  const date = new Date(semesterStart)
  while (date.getDay() !== target) {
    date.setDate(date.getDate() + 1)
  }
  return date
}

function toIcsDate(date: Date, time?: string): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  if (!time) return `${y}${m}${d}`
  const [hh, mm] = time.split(":")
  return `${y}${m}${d}T${hh}${mm}00`
}

// Generates a weekly-recurring .ics calendar from timetable entries, run
// for the given semester date range.
export function generateIcs(
  entries: TimetableEntry[],
  semesterStart: string,
  semesterEnd: string
): string {
  const start = new Date(semesterStart)
  const until = toIcsDate(new Date(semesterEnd))

  const events = entries.map((e, i) => {
    const firstDate = firstOccurrence(start, e.day)
    const dtstart = toIcsDate(firstDate, e.start)
    const dtend = toIcsDate(firstDate, e.end)
    const byday = DAY_TO_ICS[e.day] ?? "MO"

    return [
      "BEGIN:VEVENT",
      `UID:${dtstart}-${i}@zicon-ums`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`,
      `SUMMARY:${e.title}`,
      e.subtitle ? `DESCRIPTION:${e.subtitle}` : "",
      "END:VEVENT",
    ]
      .filter(Boolean)
      .join("\r\n")
  })

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Zicon UMS//Timetable//EN", ...events, "END:VCALENDAR"].join(
    "\r\n"
  )
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
