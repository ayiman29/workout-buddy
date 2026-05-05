import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useLocalSearchParams } from "expo-router";
import { USER_ID } from "@/constants/user";
import { API_BASE_URL } from "@/constants/api";

type IntakeEntry = {
  _id?: string;
  foodName: string;
  productId?: string | null;
  grams: number;
  quantity: number;
  kcalPer100g: number;
  intakeCalories: number;
  source?: string;
  date?: string;
  createdAt?: string;
};

type FoodSuggestion = {
  productId: string | null;
  foodName: string;
  brand: string | null;
  servingSize: string | null;
  kcalPer100g: number | null;
};

type BurnEntry = {
  _id?: string;
  workout: string;
  duration: number;
  calories: number;
  date?: string;
  createdAt?: string;
};

export default function CalorieTracker() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const userId = (params.id as string) || USER_ID;

  const [history, setHistory] = useState<IntakeEntry[]>([]);
  const [burnHistory, setBurnHistory] = useState<BurnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchingFoods, setSearchingFoods] = useState(false);

  const [foodQuery, setFoodQuery] = useState("");
  const [foodSuggestions, setFoodSuggestions] = useState<FoodSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodSuggestion | null>(null);
  const [grams, setGrams] = useState("");
  const [quantity, setQuantity] = useState("1");

  // AI Nutrition Guide
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [nutritionAge, setNutritionAge] = useState("");
  const [nutritionWeight, setNutritionWeight] = useState("");
  const [nutritionHeight, setNutritionHeight] = useState("");
  const [nutritionGoal, setNutritionGoal] = useState("");
  const [nutritionActivity, setNutritionActivity] = useState("");
  const [nutritionResult, setNutritionResult] = useState<null | {
    daily_calories: number;
    macros: { protein_g: number; carbs_g: number; fat_g: number };
    meal_count: number;
    recommended_meal_types: string[];
    hydration_liters: number;
    notes: string;
  }>(null);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [nutritionError, setNutritionError] = useState("");

  // AI Image Scan
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanImageUri, setScanImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<null | {
    category?: { name: string; probability: number };
    nutrition?: {
      calories?: { value: number; unit: string };
      fat?: { value: number; unit: string };
      protein?: { value: number; unit: string };
      carbs?: { value: number; unit: string };
    };
  }>(null);
  const [loadingScan, setLoadingScan] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!showLog) {
      return;
    }

    const query = foodQuery.trim();
    if (query.length < 2) {
      setFoodSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingFoods(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/user/foods/search?q=${encodeURIComponent(query)}`
        );

        if (!res.ok) {
          setFoodSuggestions([]);
          return;
        }

        const data = await res.json();
        const list = Array.isArray(data?.foods) ? data.foods : [];
        setFoodSuggestions(list);
      } catch {
        setFoodSuggestions([]);
      } finally {
        setSearchingFoods(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [foodQuery, showLog]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [intakeRes, burnRes] = await Promise.all([
        fetch(`${API_BASE_URL}/user/${userId}/calories/intake/history`),
        fetch(`${API_BASE_URL}/user/${userId}/calories/history`),
      ]);

      if (intakeRes.ok) {
        const intakeData = await intakeRes.json();
        const intakeList = Array.isArray(intakeData) ? intakeData : intakeData.entries || [];
        setHistory(intakeList);
      } else {
        setHistory([]);
      }

      if (burnRes.ok) {
        const burnData = await burnRes.json();
        const burnList = Array.isArray(burnData) ? burnData : burnData.entries || [];
        setBurnHistory(burnList);
      } else {
        setBurnHistory([]);
      }
    } catch {
      setHistory([]);
      setBurnHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLog = async () => {
    const parsedGrams = parseFloat(grams);
    const parsedQuantity = parseFloat(quantity);

    if (!selectedFood?.foodName) {
      Alert.alert("Error", "Select a food from suggestions.");
      return;
    }

    if (!parsedGrams || parsedGrams <= 0) {
      Alert.alert("Error", "Enter grams greater than 0.");
      return;
    }

    if (!parsedQuantity || parsedQuantity <= 0) {
      Alert.alert("Error", "Enter quantity greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/user/${userId}/calories/intake/log`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            foodName: selectedFood.foodName,
            productId: selectedFood.productId,
            grams: parsedGrams,
            quantity: parsedQuantity,
            kcalPer100g: selectedFood.kcalPer100g,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Logged", "Calorie intake entry saved!");
        setShowLog(false);
        resetForm();
        fetchHistory();
      } else {
        Alert.alert("Error", data.message || "Failed to log.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFoodQuery("");
    setFoodSuggestions([]);
    setShowSuggestions(false);
    setSelectedFood(null);
    setGrams("");
    setQuantity("1");
  };

  const handleNutritionGuide = async () => {
    const age = parseFloat(nutritionAge);
    const weight_kg = parseFloat(nutritionWeight);
    const height_cm = parseFloat(nutritionHeight);

    if (!nutritionGoal || !nutritionActivity) {
      setNutritionError("Please select a goal and activity level.");
      return;
    }
    if (!age || !weight_kg || !height_cm) {
      setNutritionError("Please fill in age, weight, and height.");
      return;
    }

    setNutritionError("");
    setLoadingNutrition(true);
    setNutritionResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/user/${userId}/AI-Nutrition/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age, weight_kg, height_cm, goal: nutritionGoal, activity_level: nutritionActivity }),
      });
      const data = await res.json();
      if (res.ok) {
        setNutritionResult(data);
      } else {
        setNutritionError(data.message || "Failed to generate guide.");
      }
    } catch {
      setNutritionError("Could not reach server. Is the backend running?");
    } finally {
      setLoadingNutrition(false);
    }
  };

  const handlePickAndScanImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow photo library access to scan food images.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setScanImageUri(asset.uri);
    setScanResult(null);
    setShowScanModal(true);
    setLoadingScan(true);

    try {
      const formData = new FormData();
      formData.append("image", {
        uri: asset.uri,
        type: asset.mimeType ?? "image/jpeg",
        name: asset.fileName ?? "photo.jpg",
      } as any);

      const res = await fetch(`${API_BASE_URL}/user/${userId}/AI-Image-Scan/image`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setScanResult(data);
      } else {
        Alert.alert("Error", data.message || "Failed to analyse image.");
      }
    } catch {
      Alert.alert("Error", "Something went wrong.");
    } finally {
      setLoadingScan(false);
    }
  };

  const totalCalories = history.reduce((sum, e) => sum + (e.intakeCalories || 0), 0);
  const totalBurned = burnHistory.reduce((sum, e) => sum + (e.calories || 0), 0);
  const roundedTotalCalories = totalCalories.toFixed(2);
  const roundedTotalBurned = totalBurned.toFixed(2);
  const roundedNetCalories = (totalCalories - totalBurned).toFixed(2);
  const avgCalories =
    history.length > 0 ? Math.round(totalCalories / history.length) : 0;

  const parsedPreviewGrams = parseFloat(grams);
  const parsedPreviewQty = parseFloat(quantity);
  const intakePreview =
    selectedFood?.kcalPer100g != null
    && Number.isFinite(parsedPreviewGrams)
    && parsedPreviewGrams > 0
    && Number.isFinite(parsedPreviewQty)
    && parsedPreviewQty > 0
      ? Math.round((selectedFood.kcalPer100g * parsedPreviewGrams * parsedPreviewQty) / 100)
      : null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => router.replace(`/dashboard?id=${userId}`)}
      >
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Calorie Tracker</Text>

      <View style={styles.modeHintCard}>
        <Text style={styles.modeHintTitle}>Calorie Intake</Text>
        <Text style={styles.modeHintText}>
          Food-based intake is live now. Burned calories can be added in a later update.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{history.length}</Text>
          <Text style={styles.summaryLabel}>Intake Entries</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{roundedTotalCalories}</Text>
          <Text style={styles.summaryLabel}>Intake Cal</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{roundedTotalBurned}</Text>
          <Text style={styles.summaryLabel}>Burned Cal</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCardWide}>
          <Text style={styles.summaryValue}>{roundedNetCalories}</Text>
          <Text style={styles.summaryLabel}>Net (Intake - Burned)</Text>
        </View>
        <View style={styles.summaryCardWide}>
          <Text style={styles.summaryValue}>{avgCalories}</Text>
          <Text style={styles.summaryLabel}>Avg Intake</Text>
        </View>
      </View>

      <View style={styles.aiRow}>
        <TouchableOpacity style={styles.aiBtn} onPress={() => { setNutritionResult(null); setNutritionError(""); setShowNutritionModal(true); }}>
          <Text style={styles.aiBtnText}>AI Nutrition Guide</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.aiBtn} onPress={handlePickAndScanImage}>
          <Text style={styles.aiBtnText}>Scan Food Image</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Intake History</Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#39d2b4" style={{ marginTop: 40 }} />
        ) : history.length === 0 ? (
          <Text style={styles.emptyText}>No entries yet. Log your first food intake.</Text>
        ) : (
          history.map((entry, index) => (
            <View key={entry._id || index} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardWorkout}>{entry.foodName}</Text>
              </View>
              <View style={styles.cardStats}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{entry.intakeCalories}</Text>
                  <Text style={styles.statLabel}>cal</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{entry.grams}</Text>
                  <Text style={styles.statLabel}>g</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{entry.quantity}</Text>
                  <Text style={styles.statLabel}>qty</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{entry.kcalPer100g}</Text>
                  <Text style={styles.statLabel}>/100g</Text>
                </View>
              </View>
              {(entry.date || entry.createdAt) && (
                <Text style={styles.cardDate}>
                  {new Date(entry.date || entry.createdAt || "").toLocaleDateString()}
                </Text>
              )}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setShowLog(true)}>
        <Text style={styles.fabText}>+ Log Intake</Text>
      </TouchableOpacity>

      {/* AI Nutrition Guide Modal */}
      <Modal visible={showNutritionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>AI Nutrition Guide</Text>

            {!nutritionResult ? (
              <>
                <Text style={styles.label}>Age</Text>
                <TextInput style={styles.input} placeholder="e.g. 25" placeholderTextColor="#666"
                  keyboardType="numeric" value={nutritionAge} onChangeText={setNutritionAge} />

                <Text style={styles.label}>Weight (kg)</Text>
                <TextInput style={styles.input} placeholder="e.g. 70" placeholderTextColor="#666"
                  keyboardType="numeric" value={nutritionWeight} onChangeText={setNutritionWeight} />

                <Text style={styles.label}>Height (cm)</Text>
                <TextInput style={styles.input} placeholder="e.g. 175" placeholderTextColor="#666"
                  keyboardType="numeric" value={nutritionHeight} onChangeText={setNutritionHeight} />

                <Text style={styles.label}>Goal</Text>
                <View style={styles.chipRow}>
                  {(["weight_loss", "muscle_gain", "maintenance", "endurance"] as const).map((g) => (
                    <TouchableOpacity key={g} style={[styles.chip, nutritionGoal === g && styles.chipActive]}
                      onPress={() => setNutritionGoal(g)}>
                      <Text style={[styles.chipText, nutritionGoal === g && styles.chipTextActive]}>
                        {g.replace("_", " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Activity Level</Text>
                <View style={styles.chipRow}>
                  {(["sedentary", "light", "moderate", "active", "very_active"] as const).map((a) => (
                    <TouchableOpacity key={a} style={[styles.chip, nutritionActivity === a && styles.chipActive]}
                      onPress={() => setNutritionActivity(a)}>
                      <Text style={[styles.chipText, nutritionActivity === a && styles.chipTextActive]}>
                        {a.replace("_", " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={styles.guideCard}>
                <Text style={styles.guideCalories}>{nutritionResult.daily_calories}</Text>
                <Text style={styles.guideCalLabel}>kcal / day</Text>
                <View style={styles.guideMacroRow}>
                  <View style={styles.guideMacro}>
                    <Text style={styles.guideMacroVal}>{nutritionResult.macros.protein_g}g</Text>
                    <Text style={styles.guideMacroLabel}>Protein</Text>
                  </View>
                  <View style={styles.guideMacro}>
                    <Text style={styles.guideMacroVal}>{nutritionResult.macros.carbs_g}g</Text>
                    <Text style={styles.guideMacroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.guideMacro}>
                    <Text style={styles.guideMacroVal}>{nutritionResult.macros.fat_g}g</Text>
                    <Text style={styles.guideMacroLabel}>Fat</Text>
                  </View>
                </View>
                <Text style={styles.guideMeta}>{nutritionResult.meal_count} meals/day · {nutritionResult.hydration_liters}L water</Text>
                {nutritionResult.recommended_meal_types?.length > 0 && (
                  <Text style={styles.guideMeta}>{nutritionResult.recommended_meal_types.join(", ")}</Text>
                )}
                {nutritionResult.notes ? <Text style={styles.guideNotes}>{nutritionResult.notes}</Text> : null}
              </View>
            )}

            {loadingNutrition && (
              <ActivityIndicator color="#39d2b4" style={{ marginTop: 16 }} />
            )}

            {!!nutritionError && (
              <Text style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>{nutritionError}</Text>
            )}

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.cancelBtn}
                onPress={() => { setShowNutritionModal(false); setNutritionResult(null); }}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              {!nutritionResult ? (
                <TouchableOpacity
                  style={[styles.saveBtn, loadingNutrition && { opacity: 0.6 }]}
                  onPress={handleNutritionGuide}
                  disabled={loadingNutrition}>
                  <Text style={styles.saveBtnText}>{loadingNutrition ? "Generating..." : "Generate"}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.saveBtn} onPress={() => setNutritionResult(null)}>
                  <Text style={styles.saveBtnText}>Try Again</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Image Scan Modal */}
      <Modal visible={showScanModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Food Image Scan</Text>

            {scanImageUri && (
              <Image source={{ uri: scanImageUri }} style={styles.scanImage} />
            )}

            {loadingScan ? (
              <ActivityIndicator color="#39d2b4" style={{ marginVertical: 24 }} />
            ) : scanResult ? (
              <View style={styles.scanResultCard}>
                {scanResult.category && (
                  <>
                    <Text style={styles.scanFoodName}>{scanResult.category.name}</Text>
                    <Text style={styles.scanConfidence}>
                      {Math.round(scanResult.category.probability * 100)}% confidence
                    </Text>
                  </>
                )}
                {scanResult.nutrition && (
                  <View style={styles.scanNutrRow}>
                    {scanResult.nutrition.calories && (
                      <View style={styles.scanNutrItem}>
                        <Text style={styles.scanNutrVal}>{Math.round(scanResult.nutrition.calories.value)}</Text>
                        <Text style={styles.scanNutrLabel}>kcal</Text>
                      </View>
                    )}
                    {scanResult.nutrition.protein && (
                      <View style={styles.scanNutrItem}>
                        <Text style={styles.scanNutrVal}>{Math.round(scanResult.nutrition.protein.value)}g</Text>
                        <Text style={styles.scanNutrLabel}>Protein</Text>
                      </View>
                    )}
                    {scanResult.nutrition.carbs && (
                      <View style={styles.scanNutrItem}>
                        <Text style={styles.scanNutrVal}>{Math.round(scanResult.nutrition.carbs.value)}g</Text>
                        <Text style={styles.scanNutrLabel}>Carbs</Text>
                      </View>
                    )}
                    {scanResult.nutrition.fat && (
                      <View style={styles.scanNutrItem}>
                        <Text style={styles.scanNutrVal}>{Math.round(scanResult.nutrition.fat.value)}g</Text>
                        <Text style={styles.scanNutrLabel}>Fat</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : null}

            <TouchableOpacity style={[styles.cancelBtn, { marginTop: 20 }]}
              onPress={() => { setShowScanModal(false); setScanImageUri(null); setScanResult(null); }}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showLog} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Log Calorie Intake</Text>

            <Text style={styles.label}>Food</Text>
            <TextInput
              style={styles.input}
              placeholder="Type food name"
              placeholderTextColor="#666"
              value={foodQuery}
              onChangeText={(value) => {
                setFoodQuery(value);
                setSelectedFood(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />

            {showSuggestions && (
              <View style={styles.suggestionBox}>
                {searchingFoods ? (
                  <Text style={styles.suggestionHint}>Searching foods...</Text>
                ) : foodSuggestions.length === 0 ? (
                  <Text style={styles.suggestionHint}>Type at least 2 letters to search.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                    {foodSuggestions.map((item, idx) => (
                      <TouchableOpacity
                        key={`${item.productId || item.foodName}-${idx}`}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setSelectedFood(item);
                          setFoodQuery(item.foodName);
                          setShowSuggestions(false);
                        }}
                      >
                        <Text style={styles.suggestionName}>{item.foodName}</Text>
                        <Text style={styles.suggestionMeta}>
                          {item.brand || "Unknown brand"}
                          {item.kcalPer100g != null ? ` · ${item.kcalPer100g} kcal/100g` : " · kcal unavailable"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <Text style={styles.label}>Grams (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 150"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={grams}
              onChangeText={setGrams}
            />

            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={quantity}
              onChangeText={setQuantity}
            />

            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>Estimated Intake</Text>
              <Text style={styles.previewValue}>
                {intakePreview != null ? `${intakePreview} kcal` : "Select food + grams + quantity"}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowLog(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleLog}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "Saving..." : "Log Intake"}
                </Text>
              </TouchableOpacity>
            </View>
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
  back: {
    color: "#fff",
    fontSize: 28,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 14,
  },

  modeHintCard: {
    backgroundColor: "#121212",
    borderColor: "#2d2d2d",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  modeHintTitle: {
    color: "#39d2b4",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  modeHintText: {
    color: "#aaa",
    fontSize: 12,
  },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  summaryCardWide: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  summaryValue: {
    color: "#39d2b4",
    fontSize: 22,
    fontWeight: "700",
  },
  summaryLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },

  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 14,
  },
  list: {
    flex: 1,
  },
  emptyText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
    marginTop: 40,
  },

  card: {
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardWorkout: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  cardStats: {
    flexDirection: "row",
    gap: 16,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  statLabel: {
    color: "#888",
    fontSize: 11,
    marginTop: 2,
  },
  cardDate: {
    color: "#555",
    fontSize: 12,
    marginTop: 10,
  },

  fab: {
    position: "absolute",
    bottom: 30,
    right: 20,
    backgroundColor: "#39d2b4",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
  },
  fabText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
  },
  label: {
    color: "#999",
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#2a2a2a",
    color: "#fff",
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  suggestionBox: {
    backgroundColor: "#0f0f0f",
    borderColor: "#2a2a2a",
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestionHint: {
    color: "#777",
    fontSize: 13,
    padding: 12,
  },
  suggestionItem: {
    borderBottomColor: "#1f1f1f",
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestionName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  suggestionMeta: {
    color: "#8c8c8c",
    fontSize: 12,
    marginTop: 2,
  },
  previewBox: {
    backgroundColor: "#101816",
    borderColor: "#1e3f38",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  previewTitle: {
    color: "#8ecdc0",
    fontSize: 12,
    marginBottom: 4,
  },
  previewValue: {
    color: "#39d2b4",
    fontSize: 18,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
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
  saveBtn: {
    flex: 1,
    backgroundColor: "#39d2b4",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },

  aiRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  aiBtn: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderColor: "#39d2b4",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  aiBtnText: {
    color: "#39d2b4",
    fontSize: 14,
    fontWeight: "700",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
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
    backgroundColor: "#0e3530",
    borderColor: "#39d2b4",
  },
  chipText: {
    color: "#aaa",
    fontSize: 13,
  },
  chipTextActive: {
    color: "#39d2b4",
    fontWeight: "700",
  },

  guideCard: {
    backgroundColor: "#0d1f1c",
    borderColor: "#1e3f38",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
  },
  guideCalories: {
    color: "#39d2b4",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  guideCalLabel: {
    color: "#8ecdc0",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  guideMacroRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  guideMacro: {
    alignItems: "center",
  },
  guideMacroVal: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  guideMacroLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },
  guideMeta: {
    color: "#aaa",
    fontSize: 13,
    marginBottom: 6,
  },
  guideNotes: {
    color: "#888",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },

  scanImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    resizeMode: "cover",
  },
  scanResultCard: {
    backgroundColor: "#0d1f1c",
    borderColor: "#1e3f38",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  scanFoodName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "capitalize",
  },
  scanConfidence: {
    color: "#888",
    fontSize: 12,
    marginBottom: 14,
  },
  scanNutrRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  scanNutrItem: {
    alignItems: "center",
  },
  scanNutrVal: {
    color: "#39d2b4",
    fontSize: 18,
    fontWeight: "700",
  },
  scanNutrLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },
});