import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import SideDrawer from "./SideDrawer";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.55;

export default function Dashboard() {
  const data = [1, 2, 3];
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setDrawerOpen(true)}>
            <Text style={styles.menu}>≡</Text>
          </TouchableOpacity>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>
               Both hit goal = streak!
            </Text>
          </View>
        </View>

        {/* CAROUSEL */}
        <View style={styles.carouselWrapper}>
          <FlatList
            data={data}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: (width - CARD_WIDTH) / 2,
            }}
            keyExtractor={(item) => item.toString()}
            renderItem={({ item }) => (
              <View
                style={{
                  width: CARD_WIDTH,
                  marginHorizontal: 10,
                }}
              >
                <View style={styles.storyCard}>
                  <Text style={styles.photoText}>
                    Photo {item}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>

        {/* TIME */}
        <Text style={styles.time}>
          21 hours ago
        </Text>

        {/* WEEK CARD */}
        <View style={styles.weekCard}>
          <Text style={styles.sectionTitle}>
            This Week
          </Text>

          <Text style={styles.subText}>
            2/16 - 3/1
          </Text>

          <View style={styles.peopleRow}>
            <WeekRow name="ayush" active={3} />
            <WeekRow name="vru" active={4} />
          </View>
        </View>

        {/* STAKES */}
        <View style={styles.stakesCard}>
          <Text style={styles.sectionTitle}>
            The Stakes 🎯
          </Text>

          <Text style={styles.highlight}>
            1 Romantic Favor 😉
          </Text>

          <Text style={styles.subText}>
            You're safe this week
          </Text>
        </View>
      </ScrollView>

      {/* DRAWER */}
      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </View>
  );
}

function WeekRow({
  name,
  active,
}: {
  name: string;
  active: number;
}) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <View style={{ width: "48%" }}>
      <Text style={styles.name}>
        {name}
      </Text>

      <View style={styles.days}>
        {days.map((d, i) => (
          <View
            key={i}
            style={[
              styles.dayCircle,
              i < active && styles.dayActive,
            ]}
          >
            <Text style={styles.dayText}>
              {d}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    marginBottom: 30,
  },

  menu: {
    color: "#fff",
    fontSize: 22,
  },

  badge: {
    borderColor: "#00d4aa",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },

  badgeText: {
    color: "#fff",
  },

  carouselWrapper: {
    marginBottom: 10,
  },

  storyCard: {
    width: "100%",
    height: 380,
    borderRadius: 30,
    backgroundColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
  },

  photoText: {
    color: "#aaa",
    fontSize: 18,
  },

  time: {
    textAlign: "center",
    color: "#fff",
    fontSize: 18,
    marginVertical: 20,
  },

  weekCard: {
    backgroundColor: "rgba(0, 212, 170, 0.08)", // mint tint
    borderWidth: 1,
    borderColor: "rgba(0, 212, 170, 0.25)",
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 25,
    marginBottom: 20,
  },
  stakesCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 25,
  },
  sectionTitle: {
    color: "#00d4aa",
    fontSize: 18,
    marginBottom: 8,
    fontWeight: "600",
  },

  subText: {
    color: "#888",
    marginBottom: 12,
  },

  peopleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  name: {
    color: "#fff",
    marginBottom: 8,
  },

  days: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    margin: 4,
  },

  dayActive: {
    backgroundColor: "#00d4aa",
  },

  dayText: {
    color: "#fff",
    fontSize: 11,
  },

  highlight: {
    color: "#00d4aa",
    fontSize: 15,
  },
});