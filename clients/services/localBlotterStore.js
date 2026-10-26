import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLocalBlotterStore } from "../utils/localBlotters";

// Temporary local persistence: blotters do not call the server or Supabase.
export default createLocalBlotterStore(AsyncStorage);
