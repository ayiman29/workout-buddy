import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/auth";
import { API_BASE_URL } from "@/constants/api";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SideDrawer({ visible, onClose }: Props) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const userId = user?.id;
  const [fullName, setFullName] = useState(user?.name || "");
  const [isPaired, setIsPaired] = useState(false);

  useEffect(() => {
    if (user?.name) setFullName(user.name);
  }, [user]);

  useEffect(() => {
    if (!visible || !userId) return;
    fetch(`${API_BASE_URL}/user/${userId}/buddy`)
      .then((res) => res.json())
      .then((data) => setIsPaired(!!data?.buddy))
      .catch(() => {});
  }, [visible, userId]);

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  if (!visible) return null;

  return (
    <View style={styles.drawerOverlay}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} />

      <View style={styles.drawer}>
        <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={true}>
          <View style={styles.profileRow}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitial}>
                {fullName ? fullName.charAt(0).toUpperCase() : ""}
              </Text>
            </View>
            <Text style={styles.profileName}>{fullName}</Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push(`/habits?id=${userId}`);
            }}
          >
            <Text style={styles.drawerItem}>Habits</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {isPaired && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/chat?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/weekly-rules?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Weekly Rules</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/wager-balance?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Wager Balance</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/mini-bets?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Mini Bets</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push(`/partner?id=${userId}`);
            }}
          >
            <Text style={styles.drawerItem}>Partner</Text>
          </TouchableOpacity>

          {isPaired && (
            <>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/workout-models?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Workout Models</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/calorie-tracker?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Calorie Tracker</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/calendar?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Calendar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/notifications?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>Notifications</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  onClose();
                  router.push(`/history?id=${userId}`);
                }}
              >
                <Text style={styles.drawerItem}>History</Text>
              </TouchableOpacity>

              <Text style={styles.drawerItem}>Settings</Text>
            </>
          )}

          <View style={styles.divider} />

          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutItem}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerOverlay: {
    position: "absolute",
    width: "100%",
    height: "100%",
    flexDirection: "row-reverse",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawer: {
    width: 300,
    backgroundColor: "#1f1f1f",
    paddingTop: 120,
    paddingHorizontal: 25,
  },
  drawerContent: {
    paddingBottom: 40,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
  },
  profileCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#555",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  },
  profileInitial: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  profileName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#333",
    marginBottom: 30,
  },
  drawerItem: {
    color: "#fff",
    fontSize: 20,
    marginBottom: 25,
  },
  logoutItem: {
    color: "#ff5555",
    fontSize: 20,
    marginBottom: 25,
  },
});
