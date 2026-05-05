import { View, Text, StyleSheet, TouchableOpacity, Share, Alert } from "react-native";
import React, { useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import SideDrawer from "./SideDrawer";
import { API_BASE_URL } from "@/constants/api";
import { useAuth } from "@/context/auth";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (user?.role === "admin") {
      router.replace(`/admin-dashboard`);
      return;
    }
    fetch(`${API_BASE_URL}/user/${userId}/buddy`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.buddy) {
          router.replace(`/dashboard?id=${userId}`);
        }
      })
      .catch(() => {});
  }, [userId, router]);

  const handleInvitePartner = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/user/${userId}/pairing-code`);
      const data = await response.json();
      const code = data.pairingCode || "";
      const link = `workoutbuddy:///partner?id=${userId}&code=${code}`;
      await Share.share({
        message: `Join me on Workout Buddy! Use my pairing code: ${code}\n\nOr tap this link to pair automatically:\n${link}`,
      });
    } catch (error) {
      Alert.alert("Error", "Could not share invite. Please try again.");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={["#0f3d2e", "#000000"]} style={styles.container}>
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
        <TouchableOpacity style={styles.primaryButton} onPress={handleInvitePartner}>
          <Text style={styles.primaryText}>Invite Partner</Text>
        </TouchableOpacity>

        {/* DIVIDER */}
        <View style={styles.dividerRow}>
          <View style={styles.line} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.line} />
        </View>

        {/* LINK */}
        <TouchableOpacity onPress={() => router.push(`/partner?id=${userId}`)}>
          <Text style={styles.linkText}>Enter an invite code to pair</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* DRAWER COMPONENT */}
      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
