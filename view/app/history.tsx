import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function History() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>History</Text>

      <View style={styles.cardRow}>
        <View style={styles.streakCard}>
          <Text style={styles.cardLabel}>🔥 STREAK</Text>
          <Text style={styles.bigNumber}>0</Text>
          <Text style={styles.smallText}>weeks</Text>
        </View>

        <View style={styles.totalCard}>
          <Text style={styles.cardLabel}>🏆 TOTAL</Text>
          <Text style={styles.bigNumber}>0</Text>
          <Text style={styles.smallText}>Workouts logged</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Past Weeks</Text>

      <View style={styles.emptyCard}>
        <Text style={{ fontSize: 40, marginBottom: 15 }}>⏳</Text>
        <Text style={styles.emptyTitle}>No past weeks yet</Text>
        <Text style={styles.emptySub}>
          Complete your first week to see your history here
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 25,
    paddingTop: 70,
  },
  back: {
    color: "#fff",
    fontSize: 28,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 30,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  streakCard: {
    backgroundColor: "rgba(57,210,180,0.08)", // soft mint tint
    borderColor: "#39d2b4",
    borderWidth: 1,
    padding: 20,
    borderRadius: 20,
    width: "48%",
  },
  
  totalCard: {
    backgroundColor: "#111",
    padding: 20,
    borderRadius: 20,
    width: "48%",
  },
  cardLabel: {
    color: "#39d2b4",
    fontSize: 12,
    marginBottom: 10,
    letterSpacing: 1,
  },
  
  bigNumber: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "600",
  },
  smallText: {
    color: "#888",
    fontSize: 12,
    marginTop: 5,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    marginBottom: 15,
  },
  emptyCard: {
    backgroundColor: "#0e0e0e",
    borderColor: "#39d2b4",
    borderWidth: 0.5,
    padding: 40,
    borderRadius: 20,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 10,
  },
  emptySub: {
    color: "#777",
    textAlign: "center",
  },
});