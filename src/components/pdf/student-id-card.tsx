import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"

const CARD_WIDTH = 243 // ~85.6mm at 72dpi, standard ID-1 card width
const CARD_HEIGHT = 153 // ~54mm

const styles = StyleSheet.create({
  page: { padding: 12 },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 8,
    border: "1pt solid #d4d4d8",
    padding: 10,
    fontFamily: "Helvetica",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  universityName: { fontSize: 8, fontWeight: 700, flex: 1 },
  body: { flexDirection: "row", gap: 8 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 11, fontWeight: 700 },
  label: { fontSize: 6, color: "#71717a" },
  value: { fontSize: 8, marginBottom: 3 },
  qr: { width: 46, height: 46 },
  footer: { marginTop: 6, fontSize: 6, color: "#71717a", textAlign: "center" },
})

export interface StudentIdCardData {
  universityName: string
  logoUrl?: string
  studentName: string
  studentNumber: string
  programName: string
  validThrough: string
  qrDataUrl: string
  photoUrl?: string
}

export function StudentIdCardDocument({ data }: { data: StudentIdCardData }) {
  return (
    <Document>
      <Page size={[CARD_WIDTH + 24, CARD_HEIGHT + 24]} style={styles.page}>
        <View style={styles.card}>
          <View style={styles.header}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {data.logoUrl && <Image src={data.logoUrl} style={{ width: 16, height: 16 }} />}
            <Text style={styles.universityName}>{data.universityName}</Text>
          </View>
          <View style={styles.body}>
            <View style={styles.info}>
              <Text style={styles.name}>{data.studentName}</Text>
              <Text style={styles.label}>Student No.</Text>
              <Text style={styles.value}>{data.studentNumber}</Text>
              <Text style={styles.label}>Program</Text>
              <Text style={styles.value}>{data.programName}</Text>
              <Text style={styles.label}>Valid through</Text>
              <Text style={styles.value}>{data.validThrough}</Text>
            </View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            <Image src={data.qrDataUrl} style={styles.qr} />
          </View>
          <Text style={styles.footer}>Scan the QR code to verify this ID</Text>
        </View>
      </Page>
    </Document>
  )
}
