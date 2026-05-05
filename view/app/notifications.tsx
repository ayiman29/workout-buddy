import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_BASE_URL } from "@/constants/api";
import { useAuth } from "@/context/auth";
import SideDrawer from "./SideDrawer";

type NotificationItem = {
  _id: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, any>;
  status: "queued" | "delivered" | "read";
  scheduledFor?: string | null;
  deliveredAt?: string | null;
  createdAt?: string;
};

export default function Notifications() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const userId = (params.id as string) || user?.id;

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, [userId]);

  const fetchNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/notifications`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications || []);
      } else {
        Alert.alert("Error", data.message || "Failed to load notifications");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string, optimisticIndex?: number) => {
    if (!userId) return;
    try {
      // Optimistic update
      if (typeof optimisticIndex === "number") {
        const copy = [...notifications];
        copy[optimisticIndex] = { ...copy[optimisticIndex], status: "read" } as NotificationItem;
        setNotifications(copy);
      }

      const res = await fetch(
        `${API_BASE_URL}/user/${userId}/notifications/${notificationId}/read`,
        { method: "PATCH" }
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to mark read");
        fetchNotifications();
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to mark notification read");
      fetchNotifications();
    }
  };

  const markAllRead = async () => {
    try {
      const unread = notifications.filter((n) => n.status !== "read");
      for (const n of unread) {
        await markAsRead(n._id);
      }
      fetchNotifications();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to mark all read");
    }
  };

  const deleteNotification = async (notificationId: string, optimisticIndex?: number) => {
    if (!userId) return;
    try {
      // Optimistic removal
      if (typeof optimisticIndex === 'number') {
        const copy = [...notifications];
        copy.splice(optimisticIndex, 1);
        setNotifications(copy);
      }

      const res = await fetch(`${API_BASE_URL}/user/${userId}/notifications/${notificationId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.message || 'Failed to delete notification');
        fetchNotifications();
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to delete notification');
      fetchNotifications();
    }
  };

  return (
    <View style={styles.container}>
      {/* Menu Button */}
      <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerOpen(true)}>
        <Text style={{ color: "#fff", fontSize: 22 }}>≡</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity onPress={fetchNotifications} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#39d2b4" size="large" style={{ marginTop: 40 }} />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
              <Text style={styles.emptyText}>No notifications</Text>
            ) : (
              notifications.map((n, idx) => (
                <TouchableOpacity
                  key={n._id}
                  activeOpacity={0.95}
                  onPress={() => {
                    if (n.status !== "read") markAsRead(n._id, idx);
                  }}
                  style={[styles.notificationCard, n.status !== "read" && styles.unread]}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{n.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={styles.cardTime}>{
                        n.deliveredAt ? new Date(n.deliveredAt).toLocaleString() : new Date(n.createdAt || "").toLocaleString()
                      }</Text>
                      <TouchableOpacity onPress={() => deleteNotification(n._id, idx)}>
                        <Text style={styles.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.cardBody}>{n.body}</Text>
                </TouchableOpacity>
              ))
            )}

            <View style={{ height: 120 }} />
          </View>
        )}
      </ScrollView>

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  menuButton: {
    position: "absolute",
    top: 60,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  header: { paddingHorizontal: 20, paddingTop: 90, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#fff", fontSize: 28, fontWeight: "700" },
  refreshBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#1a1a1a", borderRadius: 8, borderWidth: 1, borderColor: "#39d2b4" },
  refreshText: { color: "#39d2b4", fontWeight: "700" },
  controlsRow: { flexDirection: "row", justifyContent: "flex-end", marginVertical: 12 },
  markAllBtn: { backgroundColor: "#39d2b4", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  markAllText: { color: "#000", fontWeight: "700" },
  emptyText: { color: "#666", textAlign: "center", marginTop: 40 },
  notificationCard: { backgroundColor: "#1a1a1a", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#222" },
  unread: { borderColor: "#39d2b4" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cardTime: { color: "#888", fontSize: 12 },
  cardBody: { color: "#aaa", fontSize: 13 },
  deleteText: { color: "#ff6b6b", fontSize: 12, fontWeight: "700", marginLeft: 8 },
});
