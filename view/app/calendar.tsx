import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { USER_ID } from "@/constants/user";
import { API_BASE_URL } from "@/constants/api";
import SideDrawer from "./SideDrawer";

type CalendarItem = {
  group: string;
  type: string;
  title: string;
  status: "green" | "red" | "info";
  date: string;
  meta: Record<string, any>;
};

type CalendarDay = {
  date: string;
  dateKey: string;
  items: CalendarItem[];
  counts: Record<string, number>;
};

type CalendarResponse = {
  userId: string;
  month: string;
  range: { startDate: string; endDate: string };
  days: CalendarDay[];
};

export default function Calendar() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const userId = (params.id as string) || USER_ID;

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatMonthKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  useEffect(() => {
    fetchCalendar();
  }, [currentMonth]);

  const fetchCalendar = async () => {
    try {
      setLoading(true);
      const monthStr = formatMonthKey(currentMonth);
      const res = await fetch(
        `${API_BASE_URL}/user/${userId}/calendar?month=${monthStr}`
      );
      const data = await res.json();
      if (res.ok) {
        setCalendarData(data);
      }
    } catch (error) {
      console.error("Failed to fetch calendar:", error);
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    setCurrentMonth(prev);
  };

  const goToNextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentMonth(next);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "green":
        return "#39d2b4";
      case "red":
        return "#ff6b6b";
      case "info":
        return "#888";
      default:
        return "#888";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "workout_session":
        return "💪";
      case "step_goal":
        return "👣";
      case "calorie_intake":
        return "🍽️";
      case "calorie_tracker":
        return "🔥";
      case "good_habit":
        return "✅";
      case "bad_habit":
        return "❌";
      case "weekly_goal_start":
      case "weekly_goal_end":
        return "🎯";
      case "challenge_created":
      case "challenge_deadline":
        return "🏆";
      case "buddy_weekly_workout":
        return "👥";
      default:
        return "📅";
    }
  };

  const formatMetaValue = (key: string, value: any) => {
    if (value === null || value === undefined) return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    
    // Format dates
    if (
      (key.toLowerCase().includes("date") ||
        key.toLowerCase().includes("deadline")) &&
      (typeof value === "string" || typeof value === "number")
    ) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch {}
    }
    
    if (typeof value === "number") return String(value);
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const shouldShowMetaField = (key: string): boolean => {
    // Filter out raw IDs that aren't user-friendly
    const hiddenFields = [
      "sessionId",
      "modelId",
      "goalId",
      "challengeId",
      "buddyPairId",
    ];
    return !hiddenFields.includes(key);
  };

  const formatMetaKey = (key: string): string => {
    // Convert camelCase to "Title Case Words"
    return key
      .replace(/([A-Z])/g, " $1") // Add space before capital letters
      .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
      .replace(/_/g, " ") // Replace underscores with spaces
      .trim();
  };

  const renderDayCell = (day: CalendarDay | null) => {
    if (!day) {
      return <View style={styles.dayCell} key={`empty-${Math.random()}`} />;
    }

    const hasItems = day.items && day.items.length > 0;
    const dayNum = Number(day.dateKey.slice(-2));

    return (
      <TouchableOpacity
        key={day.dateKey}
        style={[
          styles.dayCell,
          hasItems && styles.dayCellActive,
        ]}
        onPress={() => {
          if (hasItems) {
            setSelectedDay(day);
            setShowDayDetail(true);
          }
        }}
      >
        <Text style={styles.dayNum}>{dayNum}</Text>
        {hasItems && (
          <View style={styles.itemIndicators}>
            {day.items.slice(0, 3).map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.dot,
                  { backgroundColor: getStatusColor(item.status) },
                ]}
              />
            ))}
            {day.items.length > 3 && (
              <Text style={styles.moreCount}>+{day.items.length - 3}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const monthName = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Build calendar grid
  const calendarGrid: (CalendarDay | null)[] = [];
  if (calendarData) {
    const firstDay = new Date(calendarData.range.startDate);
    const startingDayOfWeek = firstDay.getDay();

    // Add empty cells for days before the month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      calendarGrid.push(null);
    }

    // Add all days
    const dayMap = new Map(calendarData.days.map((d) => [d.dateKey, d]));
    const start = new Date(calendarData.range.startDate);
    const end = new Date(calendarData.range.endDate);

    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      const dateKey = formatDateKey(date);
      calendarGrid.push(dayMap.get(dateKey) || null);
    }
  }

  return (
    <View style={styles.container}>
      {/* Menu Button */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setDrawerOpen(true)}
      >
        <Text style={{ color: "#fff", fontSize: 22 }}>≡</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Calendar</Text>
        </View>

        {/* Month Navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.navBtn}>
            <Text style={styles.navBtnText}>← Prev</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthName}</Text>
          <TouchableOpacity onPress={goToNextMonth} style={styles.navBtn}>
            <Text style={styles.navBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator
            color="#39d2b4"
            size="large"
            style={{ marginVertical: 40 }}
          />
        ) : (
          <>
            {/* Day Labels */}
            <View style={styles.dayLabelsRow}>
              {dayLabels.map((label) => (
                <View key={label} style={styles.dayLabelCell}>
                  <Text style={styles.dayLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {calendarGrid.map((day, idx) => (
                <View key={idx} style={{ width: "14.28%", aspectRatio: 1 }}>
                  {renderDayCell(day)}
                </View>
              ))}
            </View>

            {/* Summary Stats */}
            {calendarData && (
              <View style={styles.statsSection}>
                <Text style={styles.statsTitle}>This Month</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {calendarData.days.filter((d) => d.items.length > 0)
                        .length}
                    </Text>
                    <Text style={styles.statLabel}>Active Days</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {calendarData.days.reduce((sum, d) => sum + d.items.length, 0)}
                    </Text>
                    <Text style={styles.statLabel}>Total Items</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Day Detail Modal */}
      <Modal visible={showDayDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDay
                  ? new Date(`${selectedDay.dateKey}T00:00:00`).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                  : ""}
              </Text>
              <TouchableOpacity onPress={() => setShowDayDetail(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {selectedDay?.items && selectedDay.items.length > 0 ? (
                selectedDay.items.map((item, idx) => (
                  <View key={idx} style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemIcon}>
                        {getTypeIcon(item.type)}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        <Text style={styles.itemType}>{item.type}</Text>
                      </View>
                      <View
                        style={[
                          styles.itemStatus,
                          {
                            borderColor: getStatusColor(item.status),
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: getStatusColor(item.status),
                            },
                          ]}
                        />
                      </View>
                    </View>

                    {/* Meta Details */}
                    {Object.entries(item.meta).filter(([key]) =>
                      shouldShowMetaField(key)
                    ).length > 0 && (
                      <View style={styles.metaSection}>
                        {Object.entries(item.meta)
                          .filter(([key]) => shouldShowMetaField(key))
                          .map(([key, value]) => (
                            <View key={key} style={styles.metaRow}>
                              <Text style={styles.metaKey}>
                                {formatMetaKey(key)}
                              </Text>
                              <Text style={styles.metaValue}>
                                {formatMetaValue(key, value)}
                              </Text>
                            </View>
                          ))}
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No activities for this day</Text>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>

            <TouchableOpacity
              style={styles.closeModalBtn}
              onPress={() => setShowDayDetail(false)}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DRAWER COMPONENT */}
      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 90,
    paddingBottom: 16,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#0a0a0a",
    marginHorizontal: 12,
    borderRadius: 12,
    marginVertical: 12,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#39d2b4",
  },
  navBtnText: {
    color: "#39d2b4",
    fontSize: 13,
    fontWeight: "700",
  },
  monthLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  dayLabelsRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  dayLabelCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dayLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    padding: 6,
    margin: 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#222",
  },
  dayCellActive: {
    borderColor: "#39d2b4",
    backgroundColor: "#0d2620",
  },
  dayNum: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  itemIndicators: {
    flexDirection: "row",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  moreCount: {
    color: "#888",
    fontSize: 8,
    fontWeight: "600",
  },
  statsSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  statsTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#39d2b4",
  },
  statNumber: {
    color: "#39d2b4",
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    color: "#888",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#000",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: "90%",
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    color: "#888",
    fontSize: 24,
  },
  modalContent: {
    flex: 1,
  },
  itemCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  itemIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  itemTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  itemType: {
    color: "#888",
    fontSize: 11,
    marginTop: 2,
  },
  itemStatus: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metaSection: {
    backgroundColor: "#0a0a0a",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  metaKey: {
    color: "#888",
    fontSize: 11,
    textTransform: "capitalize",
    flex: 1,
  },
  metaValue: {
    color: "#39d2b4",
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  emptyText: {
    color: "#666",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
  closeModalBtn: {
    backgroundColor: "#39d2b4",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  closeModalBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
});
