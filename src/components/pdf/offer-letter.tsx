import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10 },
  letterhead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  logo: { width: 40, height: 40 },
  universityName: { fontSize: 16, fontWeight: 700 },
  date: { marginBottom: 20, color: "#52525b" },
  paragraph: { marginBottom: 12, lineHeight: 1.5 },
  bold: { fontWeight: 700 },
  signature: { marginTop: 48 },
})

export interface OfferLetterData {
  universityName: string
  logoUrl?: string
  applicantName: string
  programName: string
  applicationNumber: string
  date: string
}

export function OfferLetterDocument({ data }: { data: OfferLetterData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.letterhead}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
          {data.logoUrl && <Image src={data.logoUrl} style={styles.logo} />}
          <Text style={styles.universityName}>{data.universityName}</Text>
        </View>
        <Text style={styles.date}>{data.date}</Text>
        <Text style={styles.paragraph}>Dear {data.applicantName},</Text>
        <Text style={styles.paragraph}>
          Congratulations! We are pleased to offer you admission to the{" "}
          <Text style={styles.bold}>{data.programName}</Text> program at {data.universityName},
          following review of your application <Text style={styles.bold}>{data.applicationNumber}</Text>.
        </Text>
        <Text style={styles.paragraph}>
          Please sign in to your student portal to confirm your enrollment and complete any
          outstanding requirements. We look forward to welcoming you to campus.
        </Text>
        <Text style={styles.signature}>Office of Admissions</Text>
        <Text>{data.universityName}</Text>
      </Page>
    </Document>
  )
}
