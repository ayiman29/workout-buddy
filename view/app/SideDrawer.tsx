import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator } from "react-native";
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
  const isAdmin = user?.role === "admin";
  const [fullName, setFullName] = useState(user?.name || "");
  const [isPaired, setIsPaired] = useState(false);
  const [buddyId, setBuddyId] = useState<string | null>(null);

  // Report modal state
  const [showReport, setShowReport] = useState(false);
  const [reportCategory, setReportCategory] = useState("other");
  const [reportDesc, setReportDesc] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    if (user?.name) setFullName(user.name);
  }, [user]);

  useEffect(() => {
    if (!visible || !userId) return;
    fetch(`${API_BASE_URL}/user/${userId}/buddy`)
      .then((res) => res.json())
      .then((data) => {
        setIsPaired(!!data?.buddy);
        setBuddyId(data?.buddy?._id || data?.buddy?.id || null);
      })
      .catch(() => {});
  }, [visible, userId]);

  const handleLogout = async () => {
    onClose();
    await logout();
    router.replace("/login");
  };

  const handleSubmitReport = async () => {
    if (!reportDesc.trim()) {
      setReportError("Description is required.");
      return;
    }
    if (!buddyId) {
      setReportError("Could not identify user to report.");
      return;
    }
    setReportError("");
    setReportLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUserId: buddyId,
          category: reportCategory,
          description: reportDesc.trim(),
          targetContentType: "behavior",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReportSuccess(true);
        setReportDesc("");
        setReportCategory("other");
      } else {
        setReportError(data.message || "Failed to submit report.");
      }
    } catch {
      setReportError("Could not reach server.");
    } finally {
      setReportLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.drawerOverlay}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} />

      <View style={styles.drawer}>
        <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={true}>
          <View style={styles.profileRow}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitial}>{fullName ? fullName.charAt(0).toUpperCase() : ""}</Text>
            </View>
            <Text style={styles.profileName}>{fullName}</Text>
          </View>

          {isAdmin ? (
            <>
              <TouchableOpacity onPress={() => { onClose(); router.replace("/admin-dashboard"); }}>
                <Text style={styles.drawerItem}>Moderation</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => { onClose(); router.push(`/habits?id=${userId}`); }}>
                <Text style={styles.drawerItem}>Habits</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {isPaired && (
                <>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/chat?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/weekly-rules?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Weekly Rules</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/wager-balance?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Wager Balance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/mini-bets?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Mini Bets</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity onPress={() => { onClose(); router.push(`/calendar?id=${userId}`); }}>
                <Text style={styles.drawerItem}>Calendar</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { onClose(); router.push(`/widgets?id=${userId}`); }}>
                <Text style={styles.drawerItem}>Widgets</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { onClose(); router.push(`/partner?id=${userId}`); }}>
                <Text style={styles.drawerItem}>Partner</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { onClose(); router.push(`/history?id=${userId}`); }}>
                <Text style={styles.drawerItem}>History</Text>
              </TouchableOpacity>

              {isPaired && (
                <>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/workout-models?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Workout Models</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/calorie-tracker?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Calorie Tracker</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); router.push(`/notifications?id=${userId}`); }}>
                    <Text style={styles.drawerItem}>Notifications</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { onClose(); setShowReport(true); }}>
                    <Text style={[styles.drawerItem, { color: "#f5a623" }]}>Report User</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutItem}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Report User Modal */}
        <Modal visible={showReport} animationType="slide" transparent>
          <View style={reportStyles.overlay}>
            <View style={reportStyles.box}>
              <Text style={reportStyles.title}>Report User</Text>

              {reportSuccess ? (
                <>
                  <Text style={reportStyles.successText}>Report submitted. Our team will review it shortly.</Text>
                  <TouchableOpacity style={reportStyles.closeBtn} onPress={() => { setShowReport(false); setReportSuccess(false); }}>
                    <Text style={reportStyles.closeBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={reportStyles.label}>Category</Text>
                  <View style={reportStyles.chipRow}>
                    {(["abuse", "harassment", "spam", "cheating", "other"] as const).map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[reportStyles.chip, reportCategory === c && reportStyles.chipActive]}
                        onPress={() => setReportCategory(c)}
                      >
                        <Text style={[reportStyles.chipText, reportCategory === c && reportStyles.chipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={reportStyles.label}>Description</Text>
                  <TextInput
                    style={reportStyles.input}
                    placeholder="Describe what happened..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={4}
                    value={reportDesc}
                    onChangeText={setReportDesc}
                  />

                  {!!reportError && <Text style={reportStyles.errorText}>{reportError}</Text>}
                  {reportLoading && <ActivityIndicator color="#39d2b4" style={{ marginBottom: 8 }} />}

                  <View style={reportStyles.actions}>
                    <TouchableOpacity style={reportStyles.cancelBtn} onPress={() => { setShowReport(false); setReportError(""); setReportDesc(""); }}>
                      <Text style={reportStyles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[reportStyles.submitBtn, reportLoading && { opacity: 0.6 }]} onPress={handleSubmitReport} disabled={reportLoading}>
                      <Text style={reportStyles.submitText}>Submit</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
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

const reportStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  box: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  label: {
    color: "#999",
    fontSize: 13,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  chipActive: {
    backgroundColor: "#3d1f00",
    borderColor: "#f5a623",
  },
  chipText: {
    color: "#aaa",
    fontSize: 13,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: "#f5a623",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#2a2a2a",
    color: "#fff",
    fontSize: 15,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    textAlignVertical: "top",
    minHeight: 90,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 8,
  },
  successText: {
    color: "#39d2b4",
    fontSize: 15,
    textAlign: "center",
    marginVertical: 20,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#444",
    alignItems: "center",
  },
  cancelText: {
    color: "#fff",
    fontSize: 16,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: "#f5a623",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  submitText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    backgroundColor: "#2a2a2a",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  closeBtnText: {
    color: "#fff",
    fontSize: 16,
  },
});
