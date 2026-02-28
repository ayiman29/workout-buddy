import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function Partner() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Partner</Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeText}>XX - XXX</Text>
      </View>

      <Text style={styles.subText}>Enter partner's code</Text>

      <View style={{ alignItems: "center", marginVertical: 20 }}>
        <Text style={{ color: "#777" }}>or</Text>
      </View>

      <View style={styles.codeBox}>
        <Text style={styles.codeText}>JV-VWV</Text>
      </View>

      <TouchableOpacity
  style={styles.shareButton}
  onPress={() => router.push("/dashboard")}
>        <Text style={styles.shareText}>Share code with partner</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    padding: 30,
    paddingTop: 80,
  },
  backArrow: {
    color: "#fff",
    fontSize: 28,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 40,
  },
  codeBox: {
    backgroundColor: "#2a2a2a",
    paddingVertical: 30,
    borderRadius: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  codeText: {
    color: "#fff",
    fontSize: 28,
    letterSpacing: 3,
  },
  subText: {
    color: "#aaa",
    marginBottom: 10,
  },
  shareButton: {
    backgroundColor: "#ddd",
    paddingVertical: 20,
    borderRadius: 50,
    alignItems: "center",
    marginTop: 40,
  },
  shareText: {
    color: "#000",
    fontWeight: "600",
  },
});