import axios from "axios";
// import dotenv from "dotenv"; 

// dotenv.config();

const apiClient = axios.create({
<<<<<<< HEAD
  baseURL: "http://192.168.1.36:3000/api",
=======
  baseURL: "http://192.168.8.104:3000/api",
>>>>>>> cedd0b4e88378f0582e53b098737e1df0f4966ba
  timeout: 180000, 
  headers: {
    "Content-Type": "application/json",
  }, 
});
export default apiClient;