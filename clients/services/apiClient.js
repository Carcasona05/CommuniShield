import axios from "axios";
// import dotenv from "dotenv"; 

// dotenv.config();

const apiClient = axios.create({
  baseURL: "http://192.168.1.36:3000/api",
  timeout: 180000, 
  headers: {
    "Content-Type": "application/json",
  }, 
});
export default apiClient;