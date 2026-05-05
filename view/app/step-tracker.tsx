import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
// Load expo-sensors at runtime to avoid crashing when native module is missing
let RuntimePedometer: any = null;
import { API_BASE_URL } from "@/constants/api";
import { USER_ID } from "@/constants/user";
import { useAuth } from "@/context/auth";
import SideDrawer from "./SideDrawer";

type DailyEntry = {
  date: string;
  steps: number;
  distance?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  goalMet?: boolean;
};

type Tracker = {
  dailyStepGoal?: number;
  weeklyStepGoal?: number;
  allTimeSteps?: number;
  avgDailySteps?: number;
  avgWeeklySteps?: number;
  bestDailySteps?: number;
  bestWeeklySteps?: number;
  currentStreak?: number;
  longestStreak?: number;
  dailyHistory?: DailyEntry[];
};

export default function StepTrackerScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const userId = (params.id as string) || user?.id || USER_ID;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [tracker, setTracker] = useState<Tracker | null>(null);
  const [history, setHistory] = useState<DailyEntry[]>([]);

  const [dailyGoalInput, setDailyGoalInput] = useState("10000");
  const [weeklyGoalInput, setWeeklyGoalInput] = useState("70000");
  const [stepsInput, setStepsInput] = useState("");
  const [sensorAvailable, setSensorAvailable] = useState<boolean | null>(null);
  const [sensorPermission, setSensorPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [deviceStepsToday, setDeviceStepsToday] = useState<number | null>(null);
  const [syncingDeviceSteps, setSyncingDeviceSteps] = useState(false);
  const pedometerSubRef = useRef<{ remove: () => void } | null>(null);

  const fetchStepData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [trackerRes, historyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/user/${userId}/steps/get`),
        fetch(`${API_BASE_URL}/user/${userId}/steps/history?range=month`),
      ]);

      const trackerJson = await trackerRes.json().catch(() => null);
      const historyJson = await historyRes.json().catch(() => []);

      if (!trackerRes.ok) {
        Alert.alert("Error", trackerJson?.message || "Failed to load step tracker");
        return;
      }

      setTracker(trackerJson || {});
      setDailyGoalInput(String(trackerJson?.dailyStepGoal || 10000));
      setWeeklyGoalInput(String(trackerJson?.weeklyStepGoal || 70000));

      if (historyRes.ok && Array.isArray(historyJson)) {
        const sorted = [...historyJson].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setHistory(sorted);
      } else {
        setHistory(Array.isArray(trackerJson?.dailyHistory) ? trackerJson.dailyHistory : []);
      }
    } catch (error) {
      console.error("fetchStepData error:", error);
      Alert.alert("Error", "Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchStepData();
  }, [fetchStepData]);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const readTodayFromSensor = async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        if (!RuntimePedometer) return;
        const result = await RuntimePedometer.getStepCountAsync(start, end);
        if (mounted) {
          setDeviceStepsToday(result.steps || 0);
        }
      } catch (error) {
        console.error("readTodayFromSensor error:", error);
      }
    };

    const initPedometer = async () => {
      try {
        if (Platform.OS === "web") {
          if (mounted) {
            setSensorAvailable(false);
            setSensorPermission("denied");
          }
          return;
        }

        // Try to require the native module at runtime. If it's missing
        // (for example when running in Expo Go without the native module),
        // bail out gracefully and show a fallback to the user.
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const mod = require("expo-sensors");
          RuntimePedometer = mod?.Pedometer;
        } catch (e) {
          console.warn("expo-sensors not available at runtime:", e);
          if (mounted) {
            setSensorAvailable(false);
            setSensorPermission("denied");
          }
          return;
        }

        const available = await RuntimePedometer.isAvailableAsync();
        if (!mounted) return;
        setSensorAvailable(available);

        if (!available) {
          setSensorPermission("denied");
          return;
        }

        const permission = await RuntimePedometer.requestPermissionsAsync();
        const granted = permission.status === "granted";
        if (!mounted) return;

        setSensorPermission(granted ? "granted" : "denied");
        if (!granted) return;


        await readTodayFromSensor();

        pedometerSubRef.current = RuntimePedometer.watchStepCount(() => {
          void readTodayFromSensor();
        });

        interval = setInterval(() => {
          void readTodayFromSensor();
        }, 30000);
      } catch (error) {
        console.error("initPedometer error:", error);
        if (mounted) {
          setSensorAvailable(false);
          setSensorPermission("denied");
        }
      }
    };

    void initPedometer();

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      if (pedometerSubRef.current) {
        pedometerSubRef.current.remove();
        pedometerSubRef.current = null;
      }
    };
  }, [userId]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const todayEntry = (() => {
    const source = history.length > 0 ? history : tracker?.dailyHistory || [];
    const now = new Date();
    return source.find((item) => isSameDay(new Date(item.date), now));
  })();

  const todaySteps = todayEntry?.steps || 0;
  const todayDistance = todayEntry?.distance || 0;
  const todayCalories = todayEntry?.caloriesBurned || 0;
  const todayActiveMinutes = todayEntry?.activeMinutes || 0;
  const dailyGoal = tracker?.dailyStepGoal || 10000;
  const progress = Math.min(100, Math.round((todaySteps / Math.max(1, dailyGoal)) * 100));

  const logSteps = async (stepCount: number) => {
    if (!userId) return;
    if (!Number.isFinite(stepCount) || stepCount < 0) {
      Alert.alert("Invalid input", "Step count must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/steps/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: Math.round(stepCount) }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStepsInput("");
        await fetchStepData();
      } else {
        Alert.alert("Error", data.message || "Failed to log steps");
      }
    } catch (error) {
      console.error("logSteps error:", error);
      Alert.alert("Error", "Could not log steps.");
    } finally {
      setSaving(false);
    }
  };

  const saveGoals = async () => {
    if (!userId) return;
    const daily = Number(dailyGoalInput);
    const weekly = Number(weeklyGoalInput);

    if (!Number.isFinite(daily) || !Number.isFinite(weekly) || daily <= 0 || weekly <= 0) {
      Alert.alert("Invalid goals", "Daily and weekly goals must be positive numbers.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/steps/goal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyStepGoal: Math.round(daily), weeklyStepGoal: Math.round(weekly) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTracker((prev) => ({ ...(prev || {}), ...data }));
        Alert.alert("Saved", "Step goals updated.");
      } else {
        Alert.alert("Error", data.message || "Failed to update goals");
      }
    } catch (error) {
      console.error("saveGoals error:", error);
      Alert.alert("Error", "Could not update goals.");
    } finally {
      setSaving(false);
    }
  };

  const resetToday = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/steps/reset`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Error", data.message || "Failed to reset daily steps");
      }
      await fetchStepData();
    } catch (error) {
      console.error("resetToday error:", error);
      Alert.alert("Error", "Could not reset daily steps.");
    } finally {
      setSaving(false);
    }
  };

  const syncFromPhonePedometer = async () => {
    if (sensorPermission !== "granted") {
      Alert.alert("Permission needed", "Allow motion/fitness permissions to read phone step count.");
      return;
    }
    if (deviceStepsToday === null) {
      Alert.alert("Unavailable", "Phone step count is not ready yet.");
      return;
    }

    setSyncingDeviceSteps(true);
    try {
      await logSteps(deviceStepsToday);
    } finally {
      setSyncingDeviceSteps(false);
    }
  };

  const last7 = history.slice(0, 7);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerOpen(true)}>
        <Text style={{ color: "#fff", fontSize: 22 }}>≡</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Movement</Text>
          <Text style={styles.title}>Step Tracker</Text>
          <Text style={styles.subtitle}>Track daily steps, tune goals, and keep streak momentum.</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#39d2b4" size="large" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.contentWrap}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Today</Text>
              <Text style={styles.bigValue}>{todaySteps.toLocaleString()} steps</Text>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>{progress}% of daily goal ({dailyGoal.toLocaleString()})</Text>

              <View style={styles.metricRow}>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Distance</Text>
                  <Text style={styles.metricValue}>{todayDistance.toFixed(2)} m</Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Calories</Text>
                  <Text style={styles.metricValue}>{todayCalories}</Text>
                </View>
                <View style={styles.metricPill}>
                  <Text style={styles.metricLabel}>Active Min</Text>
                  <Text style={styles.metricValue}>{todayActiveMinutes}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Phone Pedometer</Text>
              <Text style={styles.helperText}>
                {sensorAvailable === false
                  ? "Pedometer not available on this device (or unsupported in simulator/web)."
                  : sensorPermission === "denied"
                  ? "Permission denied. Enable motion/fitness permission in system settings."
                  : sensorPermission === "granted"
                  ? "Live device steps are ready to sync."
                  : "Checking sensor availability..."}
              </Text>

              <Text style={styles.sensorValue}>
                Device today: {deviceStepsToday === null ? "--" : deviceStepsToday.toLocaleString()}
              </Text>

              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={syncFromPhonePedometer}
                  disabled={syncingDeviceSteps || sensorPermission !== "granted" || deviceStepsToday === null}
                >
                  <Text style={styles.primaryBtnText}>{syncingDeviceSteps ? "Syncing..." : "Sync Phone Steps"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={fetchStepData}>
                  <Text style={styles.secondaryBtnText}>Refresh Backend</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Log Steps</Text>
              <Text style={styles.helperText}>Backend expects total steps for today, not incremental delta.</Text>

              <TextInput
                style={styles.input}
                placeholder="Enter today total steps"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={stepsInput}
                onChangeText={setStepsInput}
              />

              <View style={styles.row}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => logSteps(Number(stepsInput))}
                  disabled={saving}
                >
                  <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save Total"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => logSteps(todaySteps + 500)}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>+500 Quick Add</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Goals</Text>
              <View style={styles.row}>
                <View style={styles.goalInputWrap}>
                  <Text style={styles.goalLabel}>Daily</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={dailyGoalInput}
                    onChangeText={setDailyGoalInput}
                  />
                </View>
                <View style={styles.goalInputWrap}>
                  <Text style={styles.goalLabel}>Weekly</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={weeklyGoalInput}
                    onChangeText={setWeeklyGoalInput}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <TouchableOpacity style={styles.primaryBtn} onPress={saveGoals} disabled={saving}>
                  <Text style={styles.primaryBtnText}>Update Goals</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.warnBtn} onPress={resetToday} disabled={saving}>
                  <Text style={styles.warnBtnText}>Reset Today</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Stats</Text>
              <View style={styles.statRow}><Text style={styles.statLabel}>Current streak</Text><Text style={styles.statValue}>{tracker?.currentStreak || 0}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Longest streak</Text><Text style={styles.statValue}>{tracker?.longestStreak || 0}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>All-time steps</Text><Text style={styles.statValue}>{(tracker?.allTimeSteps || 0).toLocaleString()}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Avg daily</Text><Text style={styles.statValue}>{(tracker?.avgDailySteps || 0).toLocaleString()}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Avg weekly</Text><Text style={styles.statValue}>{(tracker?.avgWeeklySteps || 0).toLocaleString()}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Best daily</Text><Text style={styles.statValue}>{(tracker?.bestDailySteps || 0).toLocaleString()}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Best weekly</Text><Text style={styles.statValue}>{(tracker?.bestWeeklySteps || 0).toLocaleString()}</Text></View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Last 7 Days</Text>
              {last7.length === 0 ? (
                <Text style={styles.helperText}>No history yet.</Text>
              ) : (
                last7.map((entry, idx) => (
                  <View key={`${entry.date}-${idx}`} style={styles.statRow}>
                    <Text style={styles.statLabel}>{new Date(entry.date).toLocaleDateString()}</Text>
                    <Text style={styles.statValue}>{(entry.steps || 0).toLocaleString()} steps</Text>
                  </View>
                ))
              )}
            </View>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 98,
    paddingBottom: 18,
    backgroundColor: "#0d1514",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,210,180,0.25)",
  },
  kicker: { color: "#39d2b4", fontSize: 12, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900" },
  subtitle: { color: "#9fb3ae", marginTop: 8, fontSize: 14 },
  contentWrap: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#121212",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#232323",
    padding: 14,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 10 },
  bigValue: { color: "#39d2b4", fontSize: 34, fontWeight: "900" },
  progressTrack: {
    height: 9,
    borderRadius: 99,
    backgroundColor: "#222",
    marginTop: 12,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: "#39d2b4" },
  progressText: { color: "#a3a3a3", marginTop: 8 },
  metricRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  metricPill: {
    flex: 1,
    backgroundColor: "#1b1b1b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 10,
  },
  metricLabel: { color: "#888", fontSize: 12 },
  metricValue: { color: "#fff", fontWeight: "700", marginTop: 4 },
  helperText: { color: "#8f8f8f", marginBottom: 8 },
  sensorValue: { color: "#39d2b4", fontSize: 24, fontWeight: "900", marginBottom: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    backgroundColor: "#1b1b1b",
    color: "#fff",
    borderColor: "#2b2b2b",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#39d2b4",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#032922", fontWeight: "800" },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#1d1d1d",
    borderWidth: 1,
    borderColor: "#2e2e2e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#fff", fontWeight: "700" },
  warnBtn: {
    flex: 1,
    backgroundColor: "#2a1a1a",
    borderWidth: 1,
    borderColor: "#6b2e2e",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  warnBtnText: { color: "#ff8d8d", fontWeight: "700" },
  goalInputWrap: { flex: 1 },
  goalLabel: { color: "#9d9d9d", marginBottom: 6, fontSize: 12, textTransform: "uppercase" },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
  },
  statLabel: { color: "#9e9e9e" },
  statValue: { color: "#fff", fontWeight: "700" },
});
