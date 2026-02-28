import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";

export default function WeeklyRules() {
  const router = useRouter();
  const [selected, setSelected] = useState("dinner");

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Edit Rules</Text>

      <Text style={styles.sectionTitle}>Weekly workout goal</Text>

      <View style={styles.goalBox}>
        <Text style={styles.goalHighlight}>3 days</Text>
      </View>

      <Text style={styles.sectionTitle}>Wager for missed workout</Text>
      <Text style={styles.sub}>
        If you win a week, your partner owes you this.
      </Text>

      <View style={styles.optionsRow}>
        {[
          { id: "favor", label: "1 Romantic Favor 😉" },
          { id: "dinner", label: "1 Dinner 🍽" },
          { id: "money", label: "$10 💵" },
          { id: "chore", label: "1 Chore 🧹" },
        ].map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.option,
              selected === item.id && styles.optionSelected,
            ]}
            onPress={() => setSelected(item.id)}
          >
            <Text
              style={[
                styles.optionText,
                selected === item.id && styles.optionTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.createButton}>
        <Text style={styles.createText}>Create your own</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton}>
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>
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

  sectionTitle: {
    color: "#aaa",
    fontSize: 18,
    marginBottom: 10,
  },

  sub: {
    color: "#666",
    marginBottom: 20,
  },

  goalBox: {
    backgroundColor: "#111",
    borderRadius: 20,
    paddingVertical: 30,
    alignItems: "center",
    marginBottom: 30,
  },

  goalHighlight: {
    color: "#39d2b4",
    fontSize: 28,
    fontWeight: "600",
  },

  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },

  option: {
    backgroundColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginBottom: 10,
  },

  optionSelected: {
    borderColor: "#39d2b4",
    borderWidth: 1,
    backgroundColor: "rgba(57,210,180,0.08)",
  },

  optionText: {
    color: "#ccc",
  },

  optionTextSelected: {
    color: "#39d2b4",
  },

  createButton: {
    borderWidth: 1,
    borderColor: "#444",
    borderStyle: "dashed",
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: "center",
    marginBottom: 40,
  },

  createText: {
    color: "#aaa",
  },

  saveButton: {
    backgroundColor: "#333",
    paddingVertical: 20,
    borderRadius: 40,
    alignItems: "center",
  },

  saveText: {
    color: "#888",
    fontSize: 16,
  },
});