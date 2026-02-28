import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import SideDrawer from "./SideDrawer";
export default function Home() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={["#0f3d2e", "#000000"]}
        style={styles.container}
      >
        {/* MENU BUTTON */}
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setDrawerOpen(true)}
        >
          <Text style={{ color: "#fff", fontSize: 22 }}>≡</Text>
        </TouchableOpacity>

        {/* CENTER ICON */}
        <View style={styles.centerCircle}>
          <Text style={{ fontSize: 30 }}>🏋️</Text>
        </View>

        {/* TITLE */}
        <Text style={styles.title}>Start Your Journey</Text>

        {/* MAIN BUTTON */}
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryText}>Invite Partner</Text>
        </TouchableOpacity>

        {/* DIVIDER */}
        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.line} />
        </View>

        {/* LINK */}
        <TouchableOpacity onPress={() => router.push("/partner")}>
          <Text style={styles.linkText}>
            Enter an invite code to pair
          </Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* DRAWER COMPONENT */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingTop: 120,
  },

  menuButton: {
    position: "absolute",
    top: 60,
    left: 30,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  centerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(0,255,200,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },

  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "600",
    marginBottom: 40,
  },

  primaryButton: {
    backgroundColor: "#39d2b4",
    paddingVertical: 18,
    paddingHorizontal: 80,
    borderRadius: 50,
    marginBottom: 30,
  },

  primaryText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "80%",
    marginBottom: 20,
  },

  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#333",
  },

  orText: {
    color: "#777",
    marginHorizontal: 10,
  },

  linkText: {
    color: "#39d2b4",
    fontSize: 16,
  },
});