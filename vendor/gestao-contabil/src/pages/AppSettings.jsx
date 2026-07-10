import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { SESSION_SECURITY_CACHE_KEY } from "@/lib/AuthContext";
import { useTheme } from "../components/ThemeProvider";
import { useCloudAccess } from "@/lib/useCloudAccess";
import {
  GestaoPageHeader,
  GestaoPanel,
  GestaoRestrictedPanel,
  GestaoSubTabs,
  gestaoNativeBtnPrimary,
  gestaoNativeMuted,
} from "@/components/GestaoEyeVisionChrome";

const CONFIG_SECTIONS = [
  { id: "appearance", label: "Aparência" },
  { id: "email", label: "Envio de E-mail" },
  { id: "session", label: "Configuração de tela" },
];

export default function AppSettings() {
  const {
    theme,
    bgImage,
    logoUrl,
    logoBgColor,
    primaryColor,
    secondaryColor,
    sidebarColor,
    cardColor,
    setBranding,
    setTemporaryBranding,
  } = useTheme();
  const { user } = useAuth();
  const uid = user?.uid;
  const { canSeeAppSettings, canEditOfficeBranding, activeOfficeToken, officeDisplayName, isAdminEmail, config: cloudConfig, clientEntry } = useCloudAccess();
  const officeBrandingOnly = Boolean(canEditOfficeBranding && !canSeeAppSettings);
  const queryClient = useQueryClient();
  const getLocalValue = (key, fallback = "") => {
    if (typeof window === "undefined") return fallback;
    return localStorage.getItem(key) || fallback;
  };
  const [bgInput, setBgInput] = useState(bgImage || "");
  const [logoInput, setLogoInput] = useState(logoUrl || "");
  const [logoBgColorInput, setLogoBgColorInput] = useState(logoBgColor || "transparent");
  const [primaryColorInput, setPrimaryColorInput] = useState(primaryColor || "#4f46e5");
  const [emailServiceId, setEmailServiceId] = useState(getLocalValue("emailjs_service_id", import.meta.env.VITE_EMAILJS_SERVICE_ID || ""));
  const [emailTemplateId, setEmailTemplateId] = useState(getLocalValue("emailjs_template_id", import.meta.env.VITE_EMAILJS_TEMPLATE_ID || ""));
  const [emailPublicKey, setEmailPublicKey] = useState(getLocalValue("emailjs_public_key", import.meta.env.VITE_EMAILJS_PUBLIC_KEY || ""));

  const [logoutOnCloseEnabled, setLogoutOnCloseEnabled] = useState(true);
  const [inactivityMinutesInput, setInactivityMinutesInput] = useState("20");
  const [selectedBrandingClientEmail, setSelectedBrandingClientEmail] = useState("");
  const [selectedBrandingToken, setSelectedBrandingToken] = useState("");
  const [configSection, setConfigSection] = useState("appearance");
  const [officeDisplayNameInput, setOfficeDisplayNameInput] = useState("");
  const [originalBranding, setOriginalBranding] = useState(null);
  const brandingRestoreRef = React.useRef(null);

  useEffect(() => {
    if (originalBranding) {
      brandingRestoreRef.current = () => {
        setTemporaryBranding(originalBranding);
      };
    }
  }, [originalBranding]);

  useEffect(() => {
    return () => {
      if (brandingRestoreRef.current) {
        brandingRestoreRef.current();
      }
    };
  }, []);

  useEffect(() => {
    const token = String(selectedBrandingToken || "").trim();
    const clientEmail = String(selectedBrandingClientEmail || "").trim().toLowerCase();
    
    let targetBranding = null;
    if (token) {
      const map = cloudConfig?.branding_by_token && typeof cloudConfig.branding_by_token === "object"
        ? cloudConfig.branding_by_token
        : {};
      if (map[token] && typeof map[token] === "object") {
        targetBranding = map[token];
      }
    } else if (clientEmail) {
      const map = cloudConfig?.clients && typeof cloudConfig.clients === "object" ? cloudConfig.clients : {};
      const entry = map[clientEmail];
      if (entry?.branding && typeof entry.branding === "object") {
        targetBranding = entry.branding;
      }
    }
    
    if (targetBranding) {
      setLogoInput(targetBranding.logo_url || "");
      setLogoBgColorInput(targetBranding.logo_bg_color || "transparent");
      setPrimaryColorInput(targetBranding.primary_color || "#4f46e5");
      setBgInput(targetBranding.background_image || "");
      setOfficeDisplayNameInput(
        String(targetBranding.office_display_name || officeDisplayName || "").trim()
      );

      // Captura o originalBranding apenas no momento em que começamos a visualizar a prévia de um cliente
      if (!originalBranding) {
        setOriginalBranding({
          logo_url: logoUrl || "",
          logo_bg_color: logoBgColor || "transparent",
          primary_color: primaryColor || "#4f46e5",
          secondary_color: secondaryColor || "#7c3aed",
          sidebar_color: sidebarColor || "",
          card_color: cardColor || "",
          background_image: bgImage || "",
          theme: theme,
        });
      }

      setTemporaryBranding(targetBranding);
    } else {
      // Se não há cliente selecionado, os inputs refletem o visual atual do Administrador
      const fallbackBranding = originalBranding || {
        logo_url: logoUrl || "",
        logo_bg_color: logoBgColor || "transparent",
        primary_color: primaryColor || "#4f46e5",
        secondary_color: secondaryColor || "#7c3aed",
        sidebar_color: sidebarColor || "",
        card_color: cardColor || "",
        background_image: bgImage || "",
      };
      setLogoInput(fallbackBranding.logo_url || "");
      setLogoBgColorInput(fallbackBranding.logo_bg_color || "transparent");
      setPrimaryColorInput(fallbackBranding.primary_color || "#4f46e5");
      setBgInput(fallbackBranding.background_image || "");
      setOfficeDisplayNameInput(String(officeDisplayName || "").trim());

      // Só restaura se já tínhamos uma prévia carregada anteriormente
      if (originalBranding) {
        setTemporaryBranding(originalBranding);
      }
    }
  }, [
    selectedBrandingToken,
    selectedBrandingClientEmail,
    cloudConfig,
    originalBranding,
    setTemporaryBranding,
    logoUrl,
    logoBgColor,
    primaryColor,
    secondaryColor,
    sidebarColor,
    cardColor,
    bgImage,
    officeDisplayName,
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("gc_logo_url");
    }
  }, []);

  const visibleConfigSections = useMemo(() => {
    if (officeBrandingOnly) {
      return [{ id: "appearance", label: "Logo" }];
    }
    return CONFIG_SECTIONS;
  }, [officeBrandingOnly]);

  useEffect(() => {
    if (!visibleConfigSections.some((s) => s.id === configSection)) {
      setConfigSection(visibleConfigSections[0]?.id || "appearance");
    }
  }, [visibleConfigSections, configSection]);

  const openEmailJsLink = (url) => {
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    const security = cloudConfig?.session_security && typeof cloudConfig.session_security === "object"
      ? cloudConfig.session_security
      : {};
    const logoutOnClose = Object.hasOwn(security, "logout_on_close") ? Boolean(security.logout_on_close) : true;
    const inactivity = Number(security.inactivity_minutes);
    const normalizedInactivity = Number.isFinite(inactivity)
      ? String(Math.max(1, Math.min(240, Math.round(inactivity))))
      : "20";
    setLogoutOnCloseEnabled(logoutOnClose);
    setInactivityMinutesInput(normalizedInactivity);
  }, [cloudConfig]);

  useEffect(() => {
    const isCurrentUserAdmin = isAdminEmail || 
                               String(user?.email || "").trim().toLowerCase() === "ronaldojunior.gyn@gmail.com" ||
                               String(user?.email || "").trim().toLowerCase() === "ronaldojunior.gyn@usuario.local" ||
                               String(user?.email || "").trim().toLowerCase() === "ronaldojunior.gyn.emergencia@usuario.local";
    if (isCurrentUserAdmin) {
      setSelectedBrandingClientEmail("");
      setSelectedBrandingToken("");
      return;
    }
    const tok = String(activeOfficeToken || clientEntry?.assigned_company_token || "").trim();
    if (tok) {
      setSelectedBrandingToken(tok);
      setSelectedBrandingClientEmail("");
      return;
    }
    const ownEmail = String(clientEntry?.email || "").trim().toLowerCase();
    if (ownEmail) {
      setSelectedBrandingClientEmail(ownEmail);
      setSelectedBrandingToken("");
    }
  }, [isAdminEmail, clientEntry, user, activeOfficeToken]);

  const saveSessionSecurityMut = useMutation({
    mutationFn: async () => {
      const inactivity = Number(inactivityMinutesInput);
      const normalizedInactivity = Number.isFinite(inactivity)
        ? Math.max(1, Math.min(240, Math.round(inactivity)))
        : 20;
      const payload = {
        logout_on_close: Boolean(logoutOnCloseEnabled),
        inactivity_minutes: normalizedInactivity,
      };
      await dbClient.entities.CloudAccessControl.updateConfig({
        adminUid: uid,
        patch: { session_security: payload },
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(SESSION_SECURITY_CACHE_KEY, JSON.stringify(payload));
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cloudAccessControlConfig"] });
      window.alert("Configuração de tela salva com sucesso.");
    },
    onError: (e) => window.alert(e?.message || "Falha ao salvar configuração de tela."),
  });

  const handleSaveEmailConfig = () => {
    if (typeof window === "undefined") return;
    localStorage.setItem("emailjs_service_id", emailServiceId.trim());
    localStorage.setItem("emailjs_template_id", emailTemplateId.trim());
    localStorage.setItem("emailjs_public_key", emailPublicKey.trim());
    alert("Configuracao de e-mail salva com sucesso.");
  };

  const handleClearEmailConfig = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("emailjs_service_id");
    localStorage.removeItem("emailjs_template_id");
    localStorage.removeItem("emailjs_public_key");
    setEmailServiceId(import.meta.env.VITE_EMAILJS_SERVICE_ID || "");
    setEmailTemplateId(import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "");
    setEmailPublicKey(import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "");
    alert("Configuracao local de e-mail removida.");
  };

  const handleSaveBranding = () => {
    const targetCompanyToken = String(selectedBrandingToken || activeOfficeToken || "").trim();
    const targetClientEmail = String(selectedBrandingClientEmail || "").trim().toLowerCase();
    const normalizedBg = String(bgInput || "").trim();
    const normalizedOfficeName = String(officeDisplayNameInput || "").trim();
    setBranding({
      logo_url: logoInput,
      logo_bg_color: logoBgColorInput,
      primary_color: primaryColorInput,
      secondary_color: primaryColorInput,
      sidebar_color: sidebarColor,
      card_color: cardColor,
      background_image: normalizedBg,
      office_display_name: normalizedOfficeName,
      target_client_email: targetClientEmail,
      target_company_token: targetCompanyToken,
    });

    // Atualiza o originalBranding para que o unmount não restaure valores antigos/desatualizados
    // APENAS se estiver salvando a aparência global do admin
    if (!targetCompanyToken && !targetClientEmail) {
      setOriginalBranding({
        logo_url: logoInput,
        logo_bg_color: logoBgColorInput,
        primary_color: primaryColorInput,
        secondary_color: primaryColorInput,
        sidebar_color: sidebarColor,
        card_color: cardColor,
        background_image: normalizedBg,
        theme: theme,
      });
    }

    alert(
      targetClientEmail
        ? "Logo salva para o cliente selecionado."
        : targetCompanyToken
        ? "Logo salva para o token de empresa selecionado."
        : "Logo salva no sistema."
    );
  };

  const compressImageToDataUrl = (file, maxWidth = 300, maxHeight = 300, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new window.Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", quality);
          resolve(compressed);
        };
        img.onerror = () => reject(new Error("Falha ao carregar imagem para compressão."));
        img.src = String(reader.result || "");
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
      reader.readAsDataURL(file);
    });
  };

  const handleLogoFileImport = async (file) => {
    if (!file) return;
    const isImage = String(file.type || "").startsWith("image/");
    const isPdf = String(file.type || "") === "application/pdf";
    if (!isImage && !isPdf) {
      alert("Selecione uma imagem (PNG, JPG, WEBP) ou PDF.");
      return;
    }
    if (isPdf) {
      try {
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Falha ao ler PDF."));
          reader.readAsDataURL(file);
        });
        setLogoInput(dataUrl);
        alert("Logo PDF carregada com sucesso!");
      } catch (e) {
        alert(e?.message || "Falha ao importar PDF.");
      }
      return;
    }
    try {
      const compressed = await compressImageToDataUrl(file, 300, 300, 0.85);
      setLogoInput(compressed);
      alert("Logo carregada com sucesso!");
    } catch (e) {
      alert(e?.message || "Falha ao importar imagem.");
    }
  };

  if (!user) {
    return null;
  }

  if (!canSeeAppSettings && !canEditOfficeBranding) {
    return (
      <GestaoRestrictedPanel message="Você não tem permissão para acessar as configurações. Entre em contato com o administrador." />
    );
  }

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title={officeBrandingOnly ? "Logo do escritório" : "Configurações"}
        subtitle={
          officeBrandingOnly
            ? "Importe a logo visível no menu lateral"
            : "Aparência, e-mail e segurança de sessão"
        }
      />

      {visibleConfigSections.length > 1 ? (
        <GestaoSubTabs
          tabs={visibleConfigSections}
          value={configSection}
          onChange={setConfigSection}
          ariaLabel="Secções de configuração"
        />
      ) : null}

      {configSection === "appearance" ? (
        <GestaoPanel className="space-y-4 max-w-xl">
          <p className={gestaoNativeMuted}>
            Importe o arquivo da logo do escritório (PNG, JPG, WEBP ou PDF).
          </p>
          <div className="space-y-2">
            <Label htmlFor="gestao-logo-file">Arquivo da logo</Label>
            <Input
              id="gestao-logo-file"
              key={logoInput ? "logo-set" : "logo-empty"}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => handleLogoFileImport(e.target.files?.[0] || null)}
              className="max-w-md border-brand-border rounded-none"
            />
          </div>
          {logoInput ? (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <img
                src={logoInput}
                alt="Prévia da logo"
                className="h-16 w-16 object-contain border border-brand-border bg-white p-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setLogoInput("")}>
                Remover
              </Button>
            </div>
          ) : null}
          <Button type="button" onClick={handleSaveBranding} className={gestaoNativeBtnPrimary}>
            <Save className="w-4 h-4" />
            Salvar logo
          </Button>
        </GestaoPanel>
      ) : null}

      {configSection === "email" ? (
        <GestaoPanel className="space-y-4">
          <GestaoPanel className="p-4 space-y-3 bg-brand-sidebar/10 border-brand-border">
            <p className="text-[10px] font-black uppercase tracking-widest">Passo a passo EmailJS</p>
            <ol className="text-xs space-y-1 list-decimal ml-4 leading-relaxed">
              <li>Crie ou entre na sua conta EmailJS.</li>
              <li>Em Email Services, conecte o e-mail remetente (Gmail ou Outlook).</li>
              <li>Em Email Templates, crie o template e salve.</li>
              <li>Em API Keys, copie a Public Key.</li>
              <li>Cole os 3 dados abaixo e clique em Salvar.</li>
            </ol>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEmailJsLink("https://dashboard.emailjs.com/")}
              className="gap-2 border-brand-border rounded-none text-[10px] font-bold uppercase"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir EmailJS
            </Button>
          </GestaoPanel>

          <div className="space-y-2 max-w-lg">
            <Label>Service ID</Label>
            <Input
              value={emailServiceId}
              onChange={(e) => setEmailServiceId(e.target.value)}
              placeholder="service_xxxxxxx"
              className="border-brand-border rounded-none"
            />
          </div>
          <div className="space-y-2 max-w-lg">
            <Label>Template ID (obrigatório)</Label>
            <Input
              value={emailTemplateId}
              onChange={(e) => setEmailTemplateId(e.target.value)}
              placeholder="template_xxxxxxx"
              className="border-brand-border rounded-none"
            />
          </div>
          <div className="space-y-2 max-w-lg">
            <Label>Public Key</Label>
            <Input
              value={emailPublicKey}
              onChange={(e) => setEmailPublicKey(e.target.value)}
              placeholder="xxxxxxxxxxxxxxx"
              className="border-brand-border rounded-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEmailJsLink("https://dashboard.emailjs.com/admin")}
              className="gap-2 border-brand-border rounded-none text-[10px] font-bold uppercase"
            >
              <ExternalLink className="w-4 h-4" />
              Email Services
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEmailJsLink("https://dashboard.emailjs.com/admin/templates")}
              className="gap-2 border-brand-border rounded-none text-[10px] font-bold uppercase"
            >
              <ExternalLink className="w-4 h-4" />
              Email Templates
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openEmailJsLink("https://dashboard.emailjs.com/admin/account")}
              className="gap-2 border-brand-border rounded-none text-[10px] font-bold uppercase"
            >
              <ExternalLink className="w-4 h-4" />
              API Keys
            </Button>
          </div>
          <p className={gestaoNativeMuted}>
            Preencha os 3 campos para enviar e-mail direto do sistema sem abrir o Gmail.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSaveEmailConfig} className={gestaoNativeBtnPrimary}>
              <Save className="w-4 h-4" />
              Salvar configuração
            </Button>
            <Button type="button" variant="outline" onClick={handleClearEmailConfig}>
              Limpar
            </Button>
          </div>
        </GestaoPanel>
      ) : null}

      {configSection === "session" ? (
        <GestaoPanel className="space-y-4 max-w-lg">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={logoutOnCloseEnabled}
              onChange={(e) => setLogoutOnCloseEnabled(e.target.checked)}
            />
            <span>Exigir novo login sempre que fechar o navegador</span>
          </label>
          <div className="space-y-2">
            <Label>Tempo de inatividade para logout automático (minutos)</Label>
            <Input
              type="number"
              min={1}
              max={240}
              value={inactivityMinutesInput}
              onChange={(e) => setInactivityMinutesInput(e.target.value)}
              className="max-w-xs border-brand-border rounded-none"
            />
            <p className={gestaoNativeMuted}>
              Recomendado: 20 minutos. Após esse tempo sem ação, o sistema encerra a sessão.
            </p>
          </div>
          <Button
            type="button"
            className={gestaoNativeBtnPrimary}
            onClick={() => saveSessionSecurityMut.mutate()}
            disabled={saveSessionSecurityMut.isPending || !uid}
          >
            <Save className="w-4 h-4" />
            {saveSessionSecurityMut.isPending ? "Salvando..." : "Salvar configuração de tela"}
          </Button>
        </GestaoPanel>
      ) : null}
    </div>
  );
}