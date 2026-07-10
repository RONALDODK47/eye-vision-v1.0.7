import React, { useMemo } from "react";
import { Sparkles } from "lucide-react";

const toRgb = (hex) => {
  const sanitized = String(hex || "").replace("#", "").trim();
  const normalized = sanitized.length === 3
    ? sanitized
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : sanitized.padEnd(6, "0").slice(0, 6);

  const intValue = Number.parseInt(normalized, 16);
  return {
    r: (intValue >> 16) & 255,
    g: (intValue >> 8) & 255,
    b: intValue & 255,
  };
};

const initialsFromName = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "IN";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

export default function SoftwareLogo({ nome, cor, icone: Icon }) {
  const initials = useMemo(() => initialsFromName(nome), [nome]);
  const color = cor || "#6366f1";
  const rgb = useMemo(() => toRgb(color), [color]);

  return (
    <div
      className="software-logo-root"
      style={{
        "--software-color": color,
        "--software-color-rgb": `${rgb.r}, ${rgb.g}, ${rgb.b}`,
      }}
    >
      <svg
        className="software-logo-svg"
        width="148"
        height="148"
        viewBox="0 0 148 148"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`bg-${initials}`} x1="18" y1="12" x2="132" y2="136" gradientUnits="userSpaceOnUse">
            <stop stopColor={color} stopOpacity="0.96" />
            <stop offset="1" stopColor="#0f172a" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id={`shine-${initials}`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(42 28) rotate(44) scale(95)">
            <stop stopColor="#fff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <path
          d="M74 8L126 38V110L74 140L22 110V38L74 8Z"
          fill={`url(#bg-${initials})`}
          stroke="rgba(255,255,255,0.44)"
          strokeWidth="1.3"
        />
        <path
          d="M74 16L119 42V106L74 132L29 106V42L74 16Z"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.2)"
        />
        <circle cx="74" cy="74" r="52" fill={`url(#shine-${initials})`} />
      </svg>

      <div className="software-logo-brand-seal" aria-hidden="true">
        <span className="software-logo-brand-line" />
        <Sparkles size={12} />
      </div>

      <div className="software-logo-content">
        <div className="software-logo-icon-wrap">
          <Icon size={34} strokeWidth={2.2} />
        </div>
        <span className="software-logo-initials">{initials}</span>
      </div>
    </div>
  );
}
