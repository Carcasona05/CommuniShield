import emailjs from "@emailjs/react-native";

const SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID || "";
const TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID || "";
const PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY || "";

export const sendOtpEmail = async (to, otp) => {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("EmailJS is not configured. Check your environment variables.");
  }

  const expiryTime = new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  await emailjs.send(
    SERVICE_ID,
    TEMPLATE_ID,
    {
      to_email: to,
      passcode: otp,
      time: expiryTime,
      app_name: "CommuniShield",
    },
    { publicKey: PUBLIC_KEY }
  );
};
