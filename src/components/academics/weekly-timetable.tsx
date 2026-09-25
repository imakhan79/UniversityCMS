import { WEEKDAYS } from "@/lib/academics/schedule"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface TimetableEntry {
  day: string
  start: string
  end: string
  title: string
  subtitle?: string
}

export function WeeklyTimetable({ entries }: { entries: TimetableEntry[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {WEEKDAYS.map((day) => {
        const dayEntries = entries
          .filter((e) => e.day === day)
          .sort((a, b) => a.start.localeCompare(b.start))

        return (
          <Card key={day} className={cn(dayEntries.length === 0 && "opacity-60")}>
            <CardContent className="space-y-2 pt-4">
              <p className="text-xs font-semibold uppercase text-muted-foreground">{day}</p>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                dayEntries.map((e, i) => (
                  <div key={i} className="rounded-md border p-2 text-xs">
                    <p className="font-medium">{e.title}</p>
                    {e.subtitle && <p className="text-muted-foreground">{e.subtitle}</p>}
                    <p className="text-muted-foreground">
                      {e.start}–{e.end}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
