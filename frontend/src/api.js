import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;
export const ADMIN_TOKEN_KEY = "autoservis-admin-token";

const api = axios.create({
  baseURL: API_BASE,
});

const authHeaders = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

export const getStoredToken = () => localStorage.getItem(ADMIN_TOKEN_KEY);
export const setStoredToken = (token) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

const detailToMessage = (detail) => {
  if (!detail) {
    return "";
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail.map(detailToMessage).filter(Boolean).join(" • ");
  }

  if (typeof detail === "object") {
    if (typeof detail.msg === "string") {
      return detail.msg;
    }
    return Object.values(detail).map(detailToMessage).filter(Boolean).join(" • ");
  }

  return String(detail);
};

export const getApiErrorMessage = (error, fallback = "Něco se nepodařilo.") => {
  const message = detailToMessage(error?.response?.data?.detail || error?.response?.data || error?.message);
  return message || fallback;
};

export const fetchLaunchpad = async () => {
  const { data } = await api.get("/launchpad");
  return data;
};

export const loginAdmin = async (payload) => {
  const { data } = await api.post("/auth/login", payload);
  return data;
};

export const fetchCurrentAdmin = async (token) => {
  const { data } = await api.get("/auth/me", authHeaders(token));
  return data;
};

export const changeAdminCredentials = async (token, payload) => {
  const { data } = await api.post("/auth/change-credentials", payload, authHeaders(token));
  return data;
};

export const fetchAdminLinks = async (token) => {
  const { data } = await api.get("/admin/links", authHeaders(token));
  return data;
};

export const createAdminLink = async (token, payload) => {
  const { data } = await api.post("/admin/links", payload, authHeaders(token));
  return data;
};

export const updateAdminLink = async (token, id, payload) => {
  const { data } = await api.put(`/admin/links/${id}`, payload, authHeaders(token));
  return data;
};

export const deleteAdminLink = async (token, id) => {
  const { data } = await api.delete(`/admin/links/${id}`, authHeaders(token));
  return data;
};

export const reorderAdminLinks = async (token, linkIds) => {
  const { data } = await api.put(
    "/admin/links/reorder/items",
    { link_ids: linkIds },
    authHeaders(token),
  );
  return data;
};

export const fetchAdminSettings = async (token) => {
  const { data } = await api.get("/admin/settings", authHeaders(token));
  return data;
};

export const discoverAdminLogo = async (token, url) => {
  const { data } = await api.post("/admin/discover-logo", { url }, authHeaders(token));
  return data;
};

export const updateAdminSettings = async (token, payload) => {
  const { data } = await api.put("/admin/settings", payload, authHeaders(token));
  return data;
};

export const exportAdminLinks = async (token) => {
  const { data } = await api.get("/admin/export", authHeaders(token));
  return data;
};

export const importAdminLinks = async (token, payload) => {
  const { data } = await api.post("/admin/import", payload, authHeaders(token));
  return data;
};

export const trackLinkClick = async (id) => {
  const beaconUrl = `${API_BASE}/links/${id}/click`;
  if (navigator.sendBeacon) {
    navigator.sendBeacon(beaconUrl);
    return;
  }

  await fetch(beaconUrl, {
    method: "POST",
    keepalive: true,
  });
};