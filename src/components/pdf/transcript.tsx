import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"

import type { SemesterSummary } from "@/lib/academics/gpa"

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: "Helvetica", fontSize: 9 },
  letterhead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottom: "2pt solid #18181b",
    paddingBottom: 10,
    marginBottom: 14,
  },
  logo: { width: 36, height: 36 },
  universityName: { fontSize: 14, fontWeight: 700 },
  documentTitle: { fontSize: 10, color: "#52525b", marginTop: 2 },
  studentInfo: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  infoLabel: { fontSize: 7, color: "#71717a" },
  infoValue: { fontSize: 9, marginBottom: 6 },
  semesterBlock: { marginBottom: 12 },
  semesterTitle: { fontSize: 10, fontWeight: 700, marginBottom: 4 },
  tableHeader: {
    flexDirection: "row",
    borderBottom: "1pt solid #d4d4d8",
    paddingBottom: 3,
    marginBottom: 3,
  },
  tableRow: { flexDirection: "row", paddingVertical: 2 },
  colCode: { width: 60 },
  colTitle: { flex: 1 },
  colCredits: { width: 40, textAlign: "right" },
  colGrade: { width: 40, textAlign: "right" },
  colPoints: { width: 50, textAlign: "right" },
  semesterGpa: { fontSize: 8, marginTop: 4, textAlign: "right", color: "#3f3f46" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 24 },
  cgpaBox: { fontSize: 11, fontWeight: 700 },
  qr: { width: 56, height: 56 },
  verifyLabel: { fontSize: 6, color: "#71717a", textAlign: "center", marginTop: 2 },
})

export interface TranscriptData {
  universityName: string
  logoUrl?: string
  studentName: string
  studentNumber: string
  programName: string
  semesters: SemesterSummary[]
  cumulativeGpa: number
  totalCredits: number
  isOfficial: boolean
  qrDataUrl: string
  generatedAt: string
}

export function TranscriptDocument({ data }: { data: TranscriptData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {data.logoUrl && <Image src={data.logoUrl} style={styles.logo} />}
          <View>
            <Text style={styles.universityName}>{data.universityName}</Text>
            <Text style={styles.documentTitle}>
              {data.isOfficial ? "Official Academic Transcript" : "Unofficial Academic Transcript"}
            </Text>
          </View>
        </View>

        <View style={styles.studentInfo}>
          <View>
            <Text style={styles.infoLabel}>Student</Text>
            <Text style={styles.infoValue}>{data.studentName}</Text>
            <Text style={styles.infoLabel}>Student No.</Text>
            <Text style={styles.infoValue}>{data.studentNumber}</Text>
          </View>
          <View>
            <Text style={styles.infoLabel}>Program</Text>
            <Text style={styles.infoValue}>{data.programName}</Text>
            <Text style={styles.infoLabel}>Generated</Text>
            <Text style={styles.infoValue}>{data.generatedAt}</Text>
          </View>
        </View>

        {data.semesters.map((sem) => (
          <View key={sem.semesterId} style={styles.semesterBlock} wrap={false}>
            <Text style={styles.semesterTitle}>{sem.semesterName}</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.colCode}>Code</Text>
              <Text style={styles.colTitle}>Course</Text>
              <Text style={styles.colCredits}>Credits</Text>
              <Text style={styles.colGrade}>Grade</Text>
              <Text style={styles.colPoints}>Points</Text>
            </View>
            {sem.courses.map((c, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.colCode}>{c.courseCode}</Text>
                <Text style={styles.colTitle}>{c.courseTitle}</Text>
                <Text style={styles.colCredits}>{c.creditHours}</Text>
                <Text style={styles.colGrade}>{c.letterGrade ?? "—"}</Text>
                <Text style={styles.colPoints}>{c.gradePoints ?? "—"}</Text>
              </View>
            ))}
            <Text style={styles.semesterGpa}>
              Semester GPA: {sem.gpa.toFixed(3)} · {sem.creditHours} credit hours
            </Text>
          </View>
        ))}

        <View style={styles.footer}>
          <View>
            <Text style={styles.cgpaBox}>Cumulative GPA: {data.cumulativeGpa.toFixed(3)}</Text>
            <Text style={styles.infoLabel}>Total credit hours: {data.totalCredits}</Text>
          </View>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={data.qrDataUrl} style={styles.qr} />
            <Text style={styles.verifyLabel}>Scan to verify</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
