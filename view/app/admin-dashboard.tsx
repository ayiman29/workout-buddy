import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { useAuth } from "@/context/auth";
import { API_BASE_URL } from "@/constants/api";
import { useRouter } from "expo-router";

type Report = {
  _id: string;
  reporterUserId: { _id: string; name: string; email: string } | null;
  targetUserId: { _id: string; name: string; email: string } | null;
  category: string;
  targetContentType: string;
  description: string;
  evidence: string[];
  status: string;
  createdAt: string;
  actions: { action: string; note: string; takenAt: string }[];
};

const STATUS_FILTERS = ["all", "pending", "resolved", "dismissed"] as const;
const STATUS_QUERY_MAP: Record<string, string | null> = {
  all: null,
  pending: "open",
  resolved: "resolved",
  dismissed: "dismissed",
};
const ACTIONS = ["warn", "restrict", "suspend", "ban", "resolve", "dismiss"] as const;
const DURATION_ACTIONS = ["restrict", "suspend"] as const;

type ActionType = (typeof ACTIONS)[number];

function normalizeReportResponse(report: any) {
  return {
    ...report,
    reporterUserId: report.reporterId || report.reporterUserId || null,
    targetUserId: report.targetUserId || null,
  };
}

function isDurationAction(action: string): action is "restrict" | "suspend" {
  return DURATION_ACTIONS.includes(action as "restrict" | "suspend");
}

function displayStatus(status: string) {
  return status === "open" ? "pending" : status;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const adminId = user?.id || "";

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [selectedAction, setSelectedAction] = useState<ActionType | "">("");
  const [actionNote, setActionNote] = useState("");
  const [durationDays, setDurationDays] = useState("");

  const fetchReports = useCallback(async () => {
    if (!adminId) {
      setReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const statusParam = STATUS_QUERY_MAP[statusFilter];
      const params = statusParam ? `?status=${statusParam}` : "";
      const res = await fetch(`${API_BASE_URL}/user/admin/${adminId}/reports${params}`);
      const data = await res.json();
      const reportList = Array.isArray(data) ? data : data.reports || [];
      setReports(reportList.map(normalizeReportResponse));
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [adminId, statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleAction = async () => {
    if (!selectedReport || !selectedAction) {
      setActionError("Select an action.");
      return;
    }
    setActionError("");
    setActionLoading(true);
    try {
      const body: Record<string, any> = { action: selectedAction };
      if (actionNote.trim()) body.note = actionNote.trim();
      if (isDurationAction(selectedAction) && durationDays) {
        body.durationDays = parseInt(durationDays, 10);
      }
      const res = await fetch(
        `${API_BASE_URL}/user/admin/${adminId}/reports/${selectedReport._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setSelectedReport(null);
        resetActionForm();
        fetchReports();
      } else {
        setActionError(data.message || "Failed to apply action.");
      }
    } catch {
      setActionError("Could not reach server.");
    } finally {
      setActionLoading(false);
    }
  };

  const resetActionForm = () => {
    setSelectedAction("");
    setActionNote("");
    setDurationDays("");
    setActionError("");
  };

  const statusColor = (s: string) => {
    const normalized = s === "open" ? "pending" : s;
    if (normalized === "pending") return "#f5a623";
    if (normalized === "resolved") return "#39d2b4";
    if (normalized === "dismissed") return "#888";
    return "#aaa";
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Moderation</Text>
        <TouchableOpacity onPress={async () => { await logout(); router.replace("/login"); }}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, statusFilter === f && styles.filterChipActive]}
            onPress={() => setStatusFilter(f)}
          >
            <Text style={[styles.filterChipText, statusFilter === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color="#39d2b4" style={{ marginTop: 60 }} />
      ) : reports.length === 0 ? (
        <Text style={styles.emptyText}>No reports found.</Text>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {reports.map((r) => (
            <TouchableOpacity key={r._id} style={styles.card} onPress={() => { setSelectedReport(r); resetActionForm(); }}>
              <View style={styles.cardRow}>
                <Text style={styles.cardCategory}>{r.category}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(r.status) + "22", borderColor: statusColor(r.status) }]}>
                  <Text style={[styles.statusText, { color: statusColor(r.status) }]}>{displayStatus(r.status)}</Text>
                </View>
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>{r.description}</Text>
              <View style={styles.cardMeta}>
                <Text style={styles.metaText}>
                  Reporter: {r.reporterUserId?.name || "Unknown"}
                </Text>
                <Text style={styles.metaText}>
                  Target: {r.targetUserId?.name || "Unknown"}
                </Text>
              </View>
              <Text style={styles.cardDate}>{new Date(r.createdAt).toLocaleDateString()}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Report Detail + Action Modal */}
      <Modal visible={!!selectedReport} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {selectedReport && (
              <>
                <Text style={styles.modalTitle}>Report Details</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reporter</Text>
                  <Text style={styles.detailValue}>{selectedReport.reporterUserId?.name || "Unknown"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Target</Text>
                  <Text style={styles.detailValue}>{selectedReport.targetUserId?.name || "Unknown"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{selectedReport.category}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Content type</Text>
                  <Text style={styles.detailValue}>{selectedReport.targetContentType}</Text>
                </View>
                <Text style={styles.detailLabel}>Description</Text>
                <Text style={styles.descText}>{selectedReport.description}</Text>

                {selectedReport.actions?.length > 0 && (
                  <>
                    <Text style={[styles.detailLabel, { marginTop: 12 }]}>Prior actions</Text>
                    {selectedReport.actions.map((a, i) => (
                      <Text key={i} style={styles.priorAction}>{a.action}{a.note ? ` — ${a.note}` : ""}</Text>
                    ))}
                  </>
                )}

                <Text style={[styles.detailLabel, { marginTop: 16 }]}>Action</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
                  {ACTIONS.map((a) => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.actionChip, selectedAction === a && styles.actionChipActive]}
                      onPress={() => setSelectedAction(a)}
                    >
                      <Text style={[styles.actionChipText, selectedAction === a && styles.actionChipTextActive]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {isDurationAction(selectedAction) && (
                  <>
                    <Text style={styles.detailLabel}>Duration (days)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 7"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={durationDays}
                      onChangeText={setDurationDays}
                    />
                  </>
                )}

                <Text style={styles.detailLabel}>Note (optional)</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 8 }]}
                  placeholder="Add a note..."
                  placeholderTextColor="#666"
                  value={actionNote}
                  onChangeText={setActionNote}
                />

                {!!actionError && <Text style={styles.errorText}>{actionError}</Text>}

                {actionLoading && <ActivityIndicator color="#39d2b4" style={{ marginBottom: 8 }} />}

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setSelectedReport(null); resetActionForm(); }}>
                    <Text style={styles.cancelBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.applyBtn, actionLoading && { opacity: 0.6 }]} onPress={handleAction} disabled={actionLoading}>
                    <Text style={styles.applyBtnText}>{actionLoading ? "Applying..." : "Apply"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  logoutText: {
    color: "#ff5555",
    fontSize: 16,
  },
  filterRow: {
    flexGrow: 0,
    marginBottom: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
  },
  filterChipActive: {
    backgroundColor: "#0e3530",
    borderColor: "#39d2b4",
  },
  filterChipText: {
    color: "#888",
    fontSize: 14,
  },
  filterChipTextActive: {
    color: "#39d2b4",
    fontWeight: "700",
  },
  emptyText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
    marginTop: 60,
  },
  list: {
    flex: 1,
  },
  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardCategory: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  cardDesc: {
    color: "#bbb",
    fontSize: 14,
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 6,
  },
  metaText: {
    color: "#777",
    fontSize: 12,
  },
  cardDate: {
    color: "#555",
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    maxHeight: "90%",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    color: "#888",
    fontSize: 13,
    marginBottom: 4,
  },
  detailValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  descText: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 8,
    lineHeight: 20,
  },
  priorAction: {
    color: "#888",
    fontSize: 12,
    marginBottom: 2,
    textTransform: "capitalize",
  },
  actionChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#2a2a2a",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  actionChipActive: {
    backgroundColor: "#0e3530",
    borderColor: "#39d2b4",
  },
  actionChipText: {
    color: "#aaa",
    fontSize: 13,
    textTransform: "capitalize",
  },
  actionChipTextActive: {
    color: "#39d2b4",
    fontWeight: "700",
  },
  input: {
    backgroundColor: "#2a2a2a",
    color: "#fff",
    fontSize: 15,
    padding: 11,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 8,
  },
  modalActions: {
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
  cancelBtnText: {
    color: "#fff",
    fontSize: 16,
  },
  applyBtn: {
    flex: 1,
    backgroundColor: "#39d2b4",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  applyBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
});
