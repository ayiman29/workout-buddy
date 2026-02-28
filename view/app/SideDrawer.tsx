import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SideDrawer({ visible, onClose }: Props) {
  const router = useRouter();

  if (!visible) return null;

  return (
    <View style={styles.drawerOverlay}>
      {/* Dark tap area */}
      <TouchableOpacity style={styles.overlay} onPress={onClose} />

      {/* Drawer Panel */}
      <View style={styles.drawer}>
        <View style={styles.profileRow}>
          <View style={styles.profileCircle}>
            <Text style={styles.profileInitial}>M</Text>
          </View>
          <Text style={styles.profileName}>Muntaha Tahiat</Text>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          onPress={() => {
            onClose();
            router.push("/weekly-rules");
          }}
        >
          <Text style={styles.drawerItem}>Weekly Rules</Text>
        </TouchableOpacity>

        <Text style={styles.drawerItem}>Wager Balance</Text>

        <TouchableOpacity
          onPress={() => {
            onClose();
            router.push("/partner");
          }}
        >
          <Text style={styles.drawerItem}>Partner</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            onClose();
            router.push("/history");
          }}
        >
          <Text style={styles.drawerItem}>History</Text>
        </TouchableOpacity>

        <Text style={styles.drawerItem}>Settings</Text>
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
});