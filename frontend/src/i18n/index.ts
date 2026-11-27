import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./ar";
import en from "./en";

const saved = (() => { try { return localStorage.getItem("gs.lang"); } catch { return null; } })();

export function applyDirection(lng: string) {
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
}

void i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: saved === "en" ? "en" : "ar",
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});
applyDirection(i18n.language);
i18n.on("languageChanged", (lng) => {
  applyDirection(lng);
  try { localStorage.setItem("gs.lang", lng); } catch { /* storage unavailable */ }
});

export default i18n;
