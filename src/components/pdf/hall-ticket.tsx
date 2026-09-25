import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 10 },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 16 },
  row: { flexDirection: "row", marginBottom: 8 },
  label: { width: 120, color: "#71717a" },
  value: { fontWeight: 700 },
})

export interface HallTicketData {
  testName: string
  testDate: string
  applicantName: string
  applicationNumber: string
  totalMarks: number
}

export function HallTicketDocument({ data }: { data: HallTicketData }) {
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <Text style={styles.title}>Entry Test Hall Ticket</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Candidate</Text>
          <Text style={styles.value}>{data.applicantName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Application #</Text>
          <Text style={styles.value}>{data.applicationNumber}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Test</Text>
          <Text style={styles.value}>{data.testName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{data.testDate}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total marks</Text>
          <Text style={styles.value}>{data.totalMarks}</Text>
        </View>
      </Page>
    </Document>
  )
}
