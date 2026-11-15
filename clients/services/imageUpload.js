import * as ImageManipulator from "expo-image-manipulator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../services/apiClient";
import { uploadBatch } from "./uploadBatch";

async function prepareImage(uri) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 900 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return result;
}

export async function compressImage(uri) { return (await prepareImage(uri)).uri; }

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

export async function uploadImage(uri, { expectedToken, signal } = {}) {
  const token = await AsyncStorage.getItem("access_token");
  if (!token) throw new Error("Not signed in");
  if (signal?.aborted || expectedToken && token !== expectedToken) throw new Error("The signed-in account changed.");

  const image = await prepareImage(uri);
  // Use the encoder's bytes directly. Do not depend on temporary blob/file URI
  // lifetimes while several photos are being processed concurrently.
  const base64 = image.base64 || await uriToBase64(image.uri);
  if (!base64 || base64.startsWith("data:")) throw new Error("The selected photo could not be encoded. Please select it again.");
  if (signal?.aborted || token !== await AsyncStorage.getItem("access_token")) throw new Error("The signed-in account changed.");
  const name = `photo_${Date.now()}.jpg`;

  const res = await apiClient.post(
    "/upload/image",
    {
      base64,
      filename: name,
      contentType: "image/jpeg",
    },
    { headers: { Authorization: `Bearer ${token}` }, ...(signal ? { signal } : {}) }
  );

  if (typeof res.data?.url !== "string" || !res.data.url) throw new Error("Image upload did not return a URL.");
  return res.data.url;
}

export async function uploadImages(uris = [], options = {}) {
  return uploadBatch(uris, uploadImage, options);
}
