import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

import { WEEKDAYS } from "@/lib/academics/schedule"
import type { TimetableEntry } from "@/components/academics/weekly-timetable"

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Helvetica", fontSize: 8 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
  row: { flexDirection: "row", borderBottom: "1pt solid #d4d4d8" },
  dayCell: { width: 70, padding: 6, fontWeight: 700, borderRight: "1pt solid #d4d4d8" },
  entriesCell: { flex: 1, padding: 6, gap: 3 },
  entry: { fontSize: 8 },
})

export function TimetableDocument({ title, entries }: { title: string; entries: TimetableEntry[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {WEEKDAYS.map((day) => {
          const dayEntries = entries
            .filter((e) => e.day === day)
            .sort((a, b) => a.start.localeCompare(b.start))
          return (
            <View key={day} style={styles.row}>
              <Text style={styles.dayCell}>{day}</Text>
              <View style={styles.entriesCell}>
                {dayEntries.length === 0 ? (
                  <Text style={styles.entry}>—</Text>
                ) : (
                  dayEntries.map((e, i) => (
                    <Text key={i} style={styles.entry}>
                      {e.start}–{e.end}  {e.title}
                      {e.subtitle ? ` (${e.subtitle})` : ""}
                    </Text>
                  ))
                )}
              </View>
            </View>
          )
        })}
      </Page>
    </Document>
  )
}
