import React, { createContext, useContext, useState, useEffect, useLayoutEffect } from "react";
import { dbClient } from "@/api/dbClient";
import { auth } from "@/lib/firebase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { COMPANY_ACCESS_TOKEN_KEY } from "@/lib/AuthContext";

const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  bgImage: "",
  setBgImage: () => {},
  logoUrl: "",
  logoBgColor: "transparent",
  primaryColor: "#4f46e5",
  secondaryColor: "#7c3aed",
  sidebarColor: "#111827",
  sidebarTextColor: "#9ca3af",
  cardColor: "#111827",
  setBranding: () => {},
  setTemporaryBranding: () => {},
  settings: null,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export default function ThemeProvider({ children }) {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("gc_theme") || "light";
    }
    return "light";
  });
  const [bgImage, setBgImageState] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoBgColor, setLogoBgColor] = useState("transparent");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [sidebarColor, setSidebarColor] = useState("");
  const [cardColor, setCardColor] = useState("");
  const [sessionToken, setSessionToken] = useState(() => {
    return typeof window !== "undefined"
      ? String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim()
      : "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleTokenChange = () => {
      setSessionToken(String(localStorage.getItem(COMPANY_ACCESS_TOKEN_KEY) || "").trim());
    };
    window.addEventListener("gc-company-token-changed", handleTokenChange);
    window.addEventListener("storage", handleTokenChange);
    return () => {
      window.removeEventListener("gc-company-token-changed", handleTokenChange);
      window.removeEventListener("storage", handleTokenChange);
    };
  }, []);

  const setTemporaryBranding = (branding) => {
    if (!branding) {
      const logo = brandingFromCloud
        ? String(brandingFromCloud.logo_url || "").trim()
        : settings
        ? String(settings.logo_url || "").trim()
        : "";
      const logoBg = brandingFromCloud
        ? String(brandingFromCloud.logo_bg_color || "transparent").trim()
        : settings
        ? String(settings.logo_bg_color || "transparent").trim()
        : "transparent";
      const primary = brandingFromCloud
        ? normalizeHexColor(brandingFromCloud.primary_color, "")
        : settings
        ? normalizeHexColor(settings.primary_color, "")
        : "";
      const secondary = brandingFromCloud
        ? normalizeHexColor(brandingFromCloud.secondary_color, "")
        : settings
        ? normalizeHexColor(settings.secondary_color, "")
        : "";
      const sidebar = brandingFromCloud
        ? normalizeHexColor(brandingFromCloud.sidebar_color, "")
        : settings
        ? normalizeHexColor(settings.sidebar_color, "")
        : "";
      const card = brandingFromCloud
        ? normalizeHexColor(brandingFromCloud.card_color, "")
        : settings
        ? normalizeHexColor(settings.card_color, "")
        : "";
      const bg = brandingFromCloud
        ? String(brandingFromCloud.background_image || "")
        : settings
        ? String(settings.background_image || "")
        : "";

      setLogoUrl(logo);
      setLogoBgColor(logoBg);
      setPrimaryColor(primary);
      setSecondaryColor(secondary);
      setSidebarColor(sidebar);
      setCardColor(card);
      setBgImageState(bg);
      return;
    }

    const getFallback = (key, defaultVal = "") => {
      if (branding[key] !== undefined && branding[key] !== null) return branding[key];
      if (brandingFromCloud && brandingFromCloud[key] !== undefined && brandingFromCloud[key] !== null) return brandingFromCloud[key];
      if (settings && settings[key] !== undefined && settings[key] !== null) return settings[key];
      return defaultVal;
    };

    setLogoUrl(String(getFallback("logo_url") || "").trim());
    setLogoBgColor(String(getFallback("logo_bg_color", "transparent") || "transparent").trim());
    setPrimaryColor(normalizeHexColor(getFallback("primary_color"), ""));
    setSecondaryColor(normalizeHexColor(getFallback("secondary_color"), ""));
    setSidebarColor(normalizeHexColor(getFallback("sidebar_color"), ""));
    setCardColor(normalizeHexColor(getFallback("card_color"), ""));
    setBgImageState(String(getFallback("background_image") || "").trim());
  };


  const { data: settingsList } = useQuery({
    queryKey: ["appSettings", auth.currentUser?.uid],
    queryFn: () => {
      return auth.currentUser ? dbClient.entities.AppSettings.list(auth.currentUser.uid) : [];
    },
    enabled: !!auth.currentUser,
    initialData: [],
    retry: false,
  });
  const { data: cloudAccessConfig } = useQuery({
    queryKey: ["cloudAccessControlConfig"],
    queryFn: () => dbClient.entities.CloudAccessControl.getConfig(),
    enabled: !!auth.currentUser,
    retry: false,
    staleTime: 20_000,
  });

  const settings = settingsList?.[0];
  const cloudClients =
    cloudAccessConfig?.clients && typeof cloudAccessConfig.clients === "object"
      ? cloudAccessConfig.clients
      : {};
  const brandingByToken =
    cloudAccessConfig?.branding_by_token && typeof cloudAccessConfig.branding_by_token === "object"
      ? cloudAccessConfig.branding_by_token
      : {};
  const currentUserEmail = String(auth.currentUser?.email || "").trim().toLowerCase();
  
  // Identifica se o usuário atual é o Administrador do sistema
  const isAdminEmail = currentUserEmail === "ronaldojunior.gyn@gmail.com" ||
                       currentUserEmail === "ronaldojunior.gyn@usuario.local" ||
                       currentUserEmail === "ronaldojunior.gyn.emergencia@usuario.local";

  const storedCompanyToken = sessionToken;
  const rawDirectEntry = currentUserEmail ? cloudClients[currentUserEmail] || null : null;
  const directEntry = rawDirectEntry && !rawDirectEntry.is_deleted ? rawDirectEntry : null;
  const linkedCompanyToken = String(
    storedCompanyToken || directEntry?.assigned_company_token || ""
  ).trim();
  const tokenMatchedClientEntry = linkedCompanyToken
    ? Object.values(cloudClients).find((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (entry.is_deleted) return false;
        if (String(entry.account_type || "user") !== "client") return false;
        
        const pTok = String(entry.portal_token || "").trim();
        const aTok = String(entry.assigned_company_token || "").trim();
        
        // Tokens de portal/cliente (CL-, EM-, EMP-) devem corresponder a este cliente
        if (linkedCompanyToken.startsWith("CL-") || linkedCompanyToken.startsWith("EM-") || linkedCompanyToken.startsWith("EMP-")) {
          return pTok === linkedCompanyToken || aTok === linkedCompanyToken;
        }
        
        // Tokens de escritório (ADM-, CGE-) não devem corresponder a um cliente específico aqui
        return false;
      }) || null
    : null;
  const brandingSourceEntry =
    (storedCompanyToken ? null : (directEntry?.branding && typeof directEntry.branding === "object" ? directEntry : null)) ||
    (tokenMatchedClientEntry?.branding && typeof tokenMatchedClientEntry.branding === "object" ? tokenMatchedClientEntry : null);
  let brandingFromToken =
    linkedCompanyToken && brandingByToken[linkedCompanyToken] && typeof brandingByToken[linkedCompanyToken] === "object"
      ? brandingByToken[linkedCompanyToken]
      : null;
  
  // Se não encontrou branding pelo token atual, verifica o assigned_company_token da entrada cliente (se houver)
  // MAS SOMENTE SE O TOKEN ATUAL NÃO É VAZIO E NÃO VEM DO storedCompanyToken!
  if (!brandingFromToken && linkedCompanyToken && !storedCompanyToken) {
    const entryWithAssignedToken = tokenMatchedClientEntry || directEntry;
    const assignedTokenFromEntry = String(entryWithAssignedToken?.assigned_company_token || "").trim();
    if (assignedTokenFromEntry && brandingByToken[assignedTokenFromEntry] && typeof brandingByToken[assignedTokenFromEntry] === "object") {
      brandingFromToken = brandingByToken[assignedTokenFromEntry];
    }
  }
  // Fallback: se não houver branding específico do token, tenta usar branding global (vazio/"")
  const brandingGlobal =
    brandingByToken && typeof brandingByToken === "object" && brandingByToken[""] && typeof brandingByToken[""] === "object"
      ? brandingByToken[""]
      : null;
  
  // Se o usuário logado for administrador, ignora branding específico do cliente no painel geral do administrador.
  // Isso impede que tokens salvos em localStorage (ex: INOV) "vazem" e alterem a cor/logo do painel admin de forma definitiva.
  const brandingFromCloud = (!isAdminEmail && linkedCompanyToken)
    ? (
        brandingFromToken ||
        (brandingSourceEntry?.branding && typeof brandingSourceEntry.branding === "object"
          ? brandingSourceEntry.branding
          : null) ||
        brandingGlobal
      )
    : (!isAdminEmail ? brandingGlobal : null);

  const normalizeHexColor = (value, fallback) => {
    const v = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    return fallback;
  };

  const hexToRgb = (hex) => {
    const clean = String(hex || "").replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16),
    };
  };

  const darkenHex = (hex, factor = 0.14) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
    const r = clamp(rgb.r * (1 - factor));
    const g = clamp(rgb.g * (1 - factor));
    const b = clamp(rgb.b * (1 - factor));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
      .toString(16)
      .padStart(2, "0")}`;
  };

  const withAlpha = (hex, alpha = 0.75) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const a = Math.max(0, Math.min(1, Number(alpha)));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  };

  const pickReadableText = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return "#ffffff";
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.6 ? "#111111" : "#ffffff";
  };

  const isLightColor = (hex) => {
    return pickReadableText(hex) === "#111111";
  };

  useEffect(() => {
    const hasLocalTheme = typeof window !== "undefined" && localStorage.getItem("gc_theme") !== null;
    const localTheme = hasLocalTheme ? localStorage.getItem("gc_theme") : "light";
    
    setTheme(localTheme);
    
    if (brandingFromCloud) {
      setBgImageState(String(brandingFromCloud.background_image || ""));
      setLogoUrl(String(brandingFromCloud.logo_url || "").trim());
      setLogoBgColor(String(brandingFromCloud.logo_bg_color || "transparent").trim());
      setPrimaryColor(normalizeHexColor(brandingFromCloud.primary_color, ""));
      setSecondaryColor(normalizeHexColor(brandingFromCloud.secondary_color, ""));
      setSidebarColor(normalizeHexColor(brandingFromCloud.sidebar_color, ""));
      setCardColor(normalizeHexColor(brandingFromCloud.card_color, ""));
      return;
    }
    if (settings) {
      setBgImageState(settings.background_image || "");
      setLogoUrl(String(settings.logo_url || "").trim());
      setLogoBgColor(String(settings.logo_bg_color || "transparent").trim());
      setPrimaryColor(normalizeHexColor(settings.primary_color, ""));
      setSecondaryColor(normalizeHexColor(settings.secondary_color, ""));
      setSidebarColor(normalizeHexColor(settings.sidebar_color, ""));
      setCardColor(normalizeHexColor(settings.card_color, ""));
    } else {
      setLogoUrl("");
      setPrimaryColor("");
      setSecondaryColor("");
      setSidebarColor("");
      setCardColor("");
    }
  }, [settings, brandingFromCloud]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const embedLight = root.classList.contains("gestao-embed-force-light");
    if (embedLight || theme !== "dark") {
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
    }
    root.setAttribute("data-theme", embedLight ? "light" : theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === "dark";
    const primary = normalizeHexColor(primaryColor, "#4f46e5");
    const secondary = normalizeHexColor(secondaryColor, primary);
    const primaryHover = darkenHex(primary, 0.16);
    
    const defaultSidebar = isDark ? "#111827" : "#ffffff";
    const sidebar = normalizeHexColor(sidebarColor, defaultSidebar);
    
    const sideText = pickReadableText(sidebar);
    const sideTextMuted = withAlpha(sideText, 0.78);
    
    const defaultCard = isDark ? "#111827" : "#ffffff";
    const cardBg = normalizeHexColor(cardColor, defaultCard);
    
    const cardText = pickReadableText(cardBg);
    const primaryText = pickReadableText(primary);
    
    root.style.setProperty("--brand-primary", primary);
    root.style.setProperty("--brand-primary-hover", primaryHover);
    root.style.setProperty("--brand-primary-text", primaryText);
    root.style.setProperty("--brand-secondary", secondary);
    root.style.setProperty("--brand-sidebar-text", sideText);
    root.style.setProperty("--brand-sidebar-text-muted", sideTextMuted);
    root.style.setProperty("--brand-card-bg", cardBg);
    root.style.setProperty("--brand-card-text", cardText);
  }, [primaryColor, secondaryColor, sidebarColor, cardColor, theme]);

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (settings?.id) {
        return dbClient.entities.AppSettings.update(settings.id, data);
      }
      return dbClient.entities.AppSettings.create({ ...data, uid: auth.currentUser?.uid });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["appSettings"] }),
  });
  const saveClientBrandingMutation = useMutation({
    mutationFn: ({ targetEmail, data }) =>
      dbClient.entities.CloudAccessControl.upsertClient({
        adminUid: auth.currentUser?.uid,
        email: targetEmail,
        patch: { branding: data },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] }),
  });
  const saveTokenBrandingMutation = useMutation({
    mutationFn: ({ token, data }) => {
      const currentMap =
        cloudAccessConfig?.branding_by_token && typeof cloudAccessConfig.branding_by_token === "object"
          ? cloudAccessConfig.branding_by_token
          : {};
      return dbClient.entities.CloudAccessControl.updateConfig({
        adminUid: auth.currentUser?.uid,
        patch: {
          branding_by_token: {
            ...currentMap,
            [token]: data,
          },
        },
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] }),
  });

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    if (typeof window !== "undefined") {
      localStorage.setItem("gc_theme", newTheme);
    }
    saveMutation.mutate({ theme: newTheme, background_image: bgImage });
  };

  const setBgImage = (url) => {
    setBgImageState(url);
    saveMutation.mutate({ theme, background_image: url });
  };

  const setBranding = ({
    logo_url,
    logo_bg_color,
    primary_color,
    secondary_color,
    sidebar_color,
    card_color,
    target_client_email,
    target_company_token,
    background_image,
    office_display_name,
  }) => {
    const nextLogo = String(logo_url || "").trim();
    const nextLogoBg = String(logo_bg_color || "transparent").trim();
    const nextPrimary = normalizeHexColor(primary_color, primaryColor);
    const nextSecondary = normalizeHexColor(secondary_color, secondaryColor);
    const nextSidebar = normalizeHexColor(sidebar_color, sidebarColor);
    const nextCard = normalizeHexColor(card_color, cardColor);
    const nextBg =
      background_image !== undefined ? String(background_image || "").trim() : String(bgImage || "").trim();
    setLogoUrl(nextLogo);
    setLogoBgColor(nextLogoBg);
    setPrimaryColor(nextPrimary);
    setSecondaryColor(nextSecondary);
    setSidebarColor(nextSidebar);
    setCardColor(nextCard);
    if (background_image !== undefined) {
      setBgImageState(nextBg);
    }
    const payload = {
      logo_url: nextLogo,
      logo_bg_color: nextLogoBg,
      primary_color: nextPrimary,
      secondary_color: nextSecondary,
      sidebar_color: nextSidebar,
      card_color: nextCard,
      background_image: nextBg,
      office_display_name: String(office_display_name || "").trim(),
    };
    if (String(target_company_token || "").trim()) {
      saveTokenBrandingMutation.mutate({
        token: String(target_company_token || "").trim(),
        data: payload,
      });
    } else if (String(target_client_email || "").trim()) {
      saveClientBrandingMutation.mutate({
        targetEmail: String(target_client_email || "").trim().toLowerCase(),
        data: payload,
      });
    } else {
      saveMutation.mutate(payload);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        bgImage,
        setBgImage,
        logoUrl,
        logoBgColor,
        primaryColor,
        secondaryColor,
        sidebarColor,
        cardColor,
        setBranding,
        setTemporaryBranding,
        settings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
