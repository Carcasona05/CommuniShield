import { useSyncExternalStore } from "react";
import { sessionData } from "../services/sessionData";

export default function useSessionEpoch() {
  return useSyncExternalStore(sessionData.subscribe, sessionData.epoch, sessionData.epoch);
}
