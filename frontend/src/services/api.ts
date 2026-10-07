import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const getCertificateByDomain = async (
  domainId: number
) => {
  const response = await api.get(
    `/certificates/domain/${domainId}`
  );

  return response.data;
};

export const getScanHistoryByDomain = async (
  domainId: number
) => {
  const response = await api.get(
    `/scan-history/domain/${domainId}`
  );

  return response.data;
};

export default api;