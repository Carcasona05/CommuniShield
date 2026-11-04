import * as Location from "expo-location";
import { Platform } from "react-native";

export async function requestProfileDeviceLocation() {
  if (Platform.OS === "web" && typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("Location requires HTTPS (or localhost). Open the secure app URL to complete your address.");
  }
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Location permission was not granted. Your address is still required before posting or commenting. You can enable permission in your browser or device settings and try again.");
  }
  let timer;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Location timed out. Check that location services are enabled and try again.")), 20000); }),
    ]);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, permissionGranted: true };
  } finally { clearTimeout(timer); }
}
