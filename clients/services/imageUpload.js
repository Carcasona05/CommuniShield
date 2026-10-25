import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { uploadBatch } from "./uploadBatch";

export async function compressImage(uri) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 900 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

async function uriToBase64(uri) {
  if (uri.startsWith("data:")) {
    const match = uri.match(/^data:[^;]+;base64,(.*)$/);
    return match ? match[1] : uri;
  }

  const res = await fetch(uri);
  const blob = await res.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const match = String(dataUrl).match(/^data:[^;]+;base64,(.*)$/);
      resolve(match ? match[1] : dataUrl);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(blob);
  });
}

export async function uploadImage(uri) {
  const token = await AsyncStorage.getItem("access_token");
  if (!token) throw new Error("Not signed in");

  const compressedUri = await compressImage(uri);
  const base64 = await uriToBase64(compressedUri);
  const name = `photo_${Date.now()}.jpg`;

  const res = await apiClient.post(
    "/upload/image",
    {
      base64,
      filename: name,
      contentType: "image/jpeg",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (typeof res.data?.url !== "string" || !res.data.url) throw new Error("Image upload did not return a URL.");
  return res.data.url;
}

export async function uploadImages(uris = [], options = {}) {
  return uploadBatch(uris, uploadImage, options);
}
