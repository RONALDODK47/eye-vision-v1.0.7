export const INOV_AREA_STORAGE_KEY = "inov_calendar_user_area";

export function getInovUserArea() {
  if (typeof window === "undefined") return "todas";
  const v = localStorage.getItem(INOV_AREA_STORAGE_KEY);
  return v && v !== "" ? v : "todas";
}

export function setInovUserArea(value) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INOV_AREA_STORAGE_KEY, value);
  window.dispatchEvent(new Event("inov-calendar-area"));
}
