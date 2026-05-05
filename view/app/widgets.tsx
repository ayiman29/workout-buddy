import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/auth";
import { API_BASE_URL } from "@/constants/api";
import { USER_ID } from "@/constants/user";
import SideDrawer from "./SideDrawer";

type WidgetType = "streak" | "steps" | "calories" | "goals" | "habits";

type WidgetConfigItem = {
  type: WidgetType;
  size: "small" | "medium" | "large";
  metrics: string[];
  enabled: boolean;
};

type WidgetConfig = {
  userId: string;
  widgetsEnabled: WidgetConfigItem[];
  refreshInterval: number;
  theme: "auto" | "light" | "dark";
};

type WidgetMetric = {
  type: WidgetType;
  [key: string]: any;
};

type WidgetData = {
  userId: string;
  timestamp?: string;
  metrics: Record<WidgetType, WidgetMetric>;
};

const WIDGET_LABELS: Record<WidgetType, string> = {
  streak: "Workout Streak",
  steps: "Steps",
  calories: "Calories",
  goals: "Weekly Goals",
  habits: "Habits",
};

const DEFAULT_WIDGETS: WidgetConfigItem[] = [
  { type: "streak", size: "small", metrics: ["current"], enabled: true },
  { type: "steps", size: "medium", metrics: ["current", "goal", "percentage"], enabled: true },
  { type: "calories", size: "medium", metrics: ["current", "goal", "percentage"], enabled: true },
  { type: "goals", size: "small", metrics: ["count"], enabled: true },
  { type: "habits", size: "medium", metrics: ["completed", "total"], enabled: true },
];

export default function WidgetsScreen() {
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const userId = (params.id as string) || user?.id || USER_ID;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig | null>(null);
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null);
  const [refreshInterval, setRefreshInterval] = useState("3600");
  const [theme, setTheme] = useState<WidgetConfig["theme"]>("auto");

  const configItems = useMemo(() => {
    const currentItems = widgetConfig?.widgetsEnabled || DEFAULT_WIDGETS;
    return DEFAULT_WIDGETS.map((base) => {
      const found = currentItems.find((item) => item.type === base.type);
      return found || base;
    });
  }, [widgetConfig]);

  useEffect(() => {
    void fetchWidgetBundle();
  }, [userId]);

  const fetchWidgetBundle = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [configRes, dataRes] = await Promise.all([
        fetch(`${API_BASE_URL}/user/${userId}/widget-config`),
        fetch(`${API_BASE_URL}/user/${userId}/widget-data`),
      ]);

      const configJson = await configRes.json().catch(() => null);
      const dataJson = await dataRes.json().catch(() => null);

      if (configRes.ok) {
        const normalized: WidgetConfig = {
          userId,
          widgetsEnabled:
            Array.isArray(configJson?.widgetsEnabled) && configJson.widgetsEnabled.length > 0
              ? configJson.widgetsEnabled
              : DEFAULT_WIDGETS,
          refreshInterval: Number(configJson?.refreshInterval) || 3600,
          theme: configJson?.theme || "auto",
        };
        setWidgetConfig(normalized);
        setRefreshInterval(String(normalized.refreshInterval));
        setTheme(normalized.theme);
      } else {
        setWidgetConfig({
          userId,
          widgetsEnabled: DEFAULT_WIDGETS,
          refreshInterval: 3600,
          theme: "auto",
        });
        setRefreshInterval("3600");
        setTheme("auto");
      }

      if (dataRes.ok) {
        setWidgetData(dataJson);
      } else {
        setWidgetData(null);
      }
    } catch (error) {
      console.error("Failed to load widgets:", error);
      Alert.alert("Error", "Failed to load widget data.");
    } finally {
      setLoading(false);
    }
  };

  const toggleWidget = (type: WidgetType) => {
    setWidgetConfig((current) => {
      const source: WidgetConfig = current || {
        userId,
        widgetsEnabled: DEFAULT_WIDGETS,
        refreshInterval: 3600,
        theme: "auto",
      };

      return {
        ...source,
        widgetsEnabled: source.widgetsEnabled.map((item) =>
          item.type === type ? { ...item, enabled: !item.enabled } : item
        ),
      };
    });
  };

  const saveConfig = async () => {
    if (!widgetConfig) return;

    const interval = Math.max(60, Number(refreshInterval) || 3600);
    const payload = {
      widgetsEnabled: widgetConfig.widgetsEnabled,
      refreshInterval: interval,
      theme,
    };

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/widget-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setWidgetConfig((current) =>
          current
            ? { ...current, widgetsEnabled: payload.widgetsEnabled, refreshInterval: interval, theme }
            : {
                userId,
                widgetsEnabled: payload.widgetsEnabled,
                refreshInterval: interval,
                theme,
              }
        );
        setRefreshInterval(String(interval));
        Alert.alert("Saved", "Widget settings updated.");
      } else {
        Alert.alert("Error", data.message || "Failed to save widget settings.");
      }
    } catch (error) {
      console.error("saveConfig error:", error);
      Alert.alert("Error", "Could not reach server.");
    } finally {
      setSaving(false);
    }
  };

  const enabledWidgets = configItems.filter((item) => item.enabled);
  const lastSynced = widgetData?.timestamp ? new Date(widgetData.timestamp).toLocaleString() : "Not loaded";

  const renderMetricCard = (item: WidgetConfigItem) => {
    const metric = widgetData?.metrics?.[item.type];
    const label = WIDGET_LABELS[item.type];

    if (!metric) {
      return (
        <View key={item.type} style={styles.widgetCard}>
          <Text style={styles.widgetTitle}>{label}</Text>
          <Text style={styles.widgetEmpty}>No data available.</Text>
        </View>
      );
    }

    return (
      <View key={item.type} style={styles.widgetCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.widgetTitle}>{label}</Text>
          <View style={[styles.badge, !item.enabled && styles.badgeMuted]}>
            <Text style={styles.badgeText}>{item.size}</Text>
          </View>
        </View>

        {item.type === "streak" && (
          <>
            <Text style={styles.primaryValue}>{metric.current || 0} days</Text>
            <Text style={styles.cardText}>
              Last workout: {metric.lastWorkoutDate ? new Date(metric.lastWorkoutDate).toLocaleDateString() : "None"}
            </Text>
          </>
        )}

        {item.type === "steps" && (
          <>
            <Text style={styles.primaryValue}>{Number(metric.current || 0).toLocaleString()} steps</Text>
            <Text style={styles.cardText}>Goal: {Number(metric.goal || 0).toLocaleString()}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(metric.percentage || 0, 100)}%` }]} />
            </View>
            <Text style={styles.cardText}>{metric.percentage || 0}% complete</Text>
          </>
        )}

        {item.type === "calories" && (
          <>
            <Text style={styles.primaryValue}>{Number(metric.current || 0).toLocaleString()} kcal</Text>
            <Text style={styles.cardText}>Goal: {Number(metric.goal || 0).toLocaleString()} kcal</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(metric.percentage || 0, 100)}%` }]} />
            </View>
            <Text style={styles.cardText}>{metric.goalMet ? "Goal met" : `${metric.percentage || 0}% of goal`}</Text>
          </>
        )}

        {item.type === "goals" && (
          <>
            <Text style={styles.primaryValue}>{metric.active || 0} active</Text>
            <Text style={styles.cardText}>
              {metric.completed || 0} completed out of {metric.total || 0}
            </Text>
          </>
        )}

        {item.type === "habits" && (
          <>
            <Text style={styles.primaryValue}>{metric.completed || 0}/{metric.total || 0}</Text>
            <Text style={styles.cardText}>{metric.goodHabits || 0} good habits</Text>
            <Text style={styles.cardText}>{metric.badHabits || 0} bad habits</Text>
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerOpen(true)}>
        <Text style={{ color: "#fff", fontSize: 22 }}>≡</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Home Screen Widgets</Text>
          <Text style={styles.title}>Customize your dashboard</Text>
          <Text style={styles.subtitle}>
            Choose which widgets stay active, adjust refresh timing, and preview your live health metrics.
          </Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Last synced</Text>
              <Text style={styles.metaValue}>{lastSynced}</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaLabel}>Enabled</Text>
              <Text style={styles.metaValue}>{enabledWidgets.length}</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={saveConfig} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save Settings"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={fetchWidgetBundle}>
              <Text style={styles.secondaryBtnText}>Refresh Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          {loading ? (
            <ActivityIndicator color="#39d2b4" style={{ marginVertical: 20 }} />
          ) : (
            <>
              <View style={styles.settingsCard}>
                <Text style={styles.settingLabel}>Refresh interval (seconds)</Text>
                <TextInput
                  style={styles.input}
                  value={refreshInterval}
                  onChangeText={setRefreshInterval}
                  keyboardType="number-pad"
                  placeholder="3600"
                  placeholderTextColor="#666"
                />

                <Text style={styles.settingLabel}>Theme</Text>
                <View style={styles.choiceRow}>
                  {(["auto", "light", "dark"] as const).map((choice) => (
                    <TouchableOpacity
                      key={choice}
                      style={[styles.choiceChip, theme === choice && styles.choiceChipActive]}
                      onPress={() => setTheme(choice)}
                    >
                      <Text style={[styles.choiceText, theme === choice && styles.choiceTextActive]}>{choice}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.widgetToggleList}>
                {configItems.map((item) => (
                  <TouchableOpacity
                    key={item.type}
                    style={[styles.toggleRow, item.enabled && styles.toggleRowActive]}
                    onPress={() => toggleWidget(item.type)}
                    activeOpacity={0.85}
                  >
                    <View>
                      <Text style={styles.toggleTitle}>{WIDGET_LABELS[item.type]}</Text>
                      <Text style={styles.toggleSubtitle}>
                        Size: {item.size} • Metrics: {item.metrics.join(", ")}
                      </Text>
                    </View>
                    <View style={[styles.switchTrack, item.enabled && styles.switchTrackActive]}>
                      <View style={[styles.switchThumb, item.enabled && styles.switchThumbActive]} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Live Preview</Text>
          {enabledWidgets.length === 0 ? (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyTitle}>No widgets enabled</Text>
              <Text style={styles.emptyText}>Turn on at least one widget in Configuration to see it here.</Text>
            </View>
          ) : (
            enabledWidgets.map(renderMetricCard)
          )}
        </View>
      </ScrollView>

      <SideDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#070707" },
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
  content: { paddingBottom: 48 },
  hero: {
    paddingTop: 110,
    paddingHorizontal: 20,
    paddingBottom: 22,
    backgroundColor: "#0d1514",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,210,180,0.15)",
  },
  kicker: { color: "#39d2b4", fontSize: 13, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 },
  title: { color: "#fff", fontSize: 30, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#a5b8b4", fontSize: 15, lineHeight: 22 },
  heroMetaRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  metaPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  metaLabel: { color: "#7f8f8a", fontSize: 12, textTransform: "uppercase", marginBottom: 4 },
  metaValue: { color: "#fff", fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 18 },
  primaryBtn: { flex: 1, backgroundColor: "#39d2b4", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  primaryBtnText: { color: "#04251f", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#141414",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  secondaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  section: { paddingHorizontal: 20, paddingTop: 22 },
  sectionTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 14 },
  settingsCard: {
    backgroundColor: "#111111",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#202020",
    marginBottom: 14,
  },
  settingLabel: { color: "#9aa7a3", fontSize: 13, marginBottom: 8, textTransform: "uppercase" },
  input: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2d2d2d",
    marginBottom: 14,
  },
  choiceRow: { flexDirection: "row", gap: 10, marginBottom: 4, flexWrap: "wrap" },
  choiceChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2d2d2d",
  },
  choiceChipActive: { backgroundColor: "rgba(57,210,180,0.16)", borderColor: "#39d2b4" },
  choiceText: { color: "#a7b2b0", fontWeight: "700", textTransform: "capitalize" },
  choiceTextActive: { color: "#39d2b4" },
  widgetToggleList: { gap: 12 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "#202020",
  },
  toggleRowActive: { borderColor: "rgba(57,210,180,0.35)" },
  toggleTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  toggleSubtitle: { color: "#8e9996", fontSize: 12 },
  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#2a2a2a",
    padding: 3,
    justifyContent: "center",
  },
  switchTrackActive: { backgroundColor: "rgba(57,210,180,0.28)" },
  switchThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#8a8a8a" },
  switchThumbActive: { backgroundColor: "#39d2b4", alignSelf: "flex-end" },
  widgetCard: {
    backgroundColor: "#111111",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#202020",
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  widgetTitle: { color: "#fff", fontSize: 17, fontWeight: "800" },
  badge: { backgroundColor: "rgba(57,210,180,0.14)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeMuted: { backgroundColor: "rgba(255,255,255,0.08)" },
  badgeText: { color: "#39d2b4", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  primaryValue: { color: "#39d2b4", fontSize: 28, fontWeight: "900", marginBottom: 6 },
  cardText: { color: "#a7b2b0", fontSize: 13, marginTop: 4 },
  widgetEmpty: { color: "#7d7d7d", fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 999, backgroundColor: "#222", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", backgroundColor: "#39d2b4", borderRadius: 999 },
  emptyPreview: {
    backgroundColor: "#111111",
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: "#202020",
  },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: "#8f9b97", fontSize: 13, lineHeight: 20 },
});