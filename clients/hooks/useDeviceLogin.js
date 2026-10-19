import { useState } from "react";
import apiClient from "../services/apiClient";
import { getTrustedDevice, saveTrustedDevice } from "../services/trustedDevice";

export default function useDeviceLogin(onAuthenticated) {
  const [pending, setPending] = useState(null);
  const request = async (email, password, admin, resend = false) => {
    const { data } = await apiClient.post(admin ? "/admin/login" : "/login", {
      email, password, device_token: resend ? undefined : await getTrustedDevice(email),
    });
    return data;
  };
  const beginLogin = async (email, password, admin = false) => {
    const data = await request(email, password, admin);
    if (data.verification_required) {
      setPending({ email, password, admin, challenge: data });
    } else {
      if (!data.access_token) throw new Error("No access token received.");
      await onAuthenticated(data);
    }
  };
  return {
    beginLogin,
    verificationModalProps: {
      challenge: pending?.challenge,
      onCancel: () => setPending(null),
      onResend: async () => {
        if (!pending) return;
        const data = await request(pending.email, pending.password, pending.admin, true);
        setPending({ ...pending, challenge: data });
      },
      onVerify: async (code) => {
        if (!pending) return;
        const { data } = await apiClient.post("/login/verify", { challenge_id: pending.challenge.challenge_id, code });
        if (!data.access_token || !data.device_token) throw new Error("Verification did not complete. Please sign in again.");
        // Do not clear this proof on logout: it is scoped to this account/device.
        await saveTrustedDevice(pending.email, data.device_token);
        await onAuthenticated(data);
        setPending(null);
      },
    },
  };
}
