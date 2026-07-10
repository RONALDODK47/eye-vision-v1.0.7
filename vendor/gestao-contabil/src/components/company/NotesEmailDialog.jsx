import React, { useEffect, useState } from "react";
import { dbClient } from "@/api/dbClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "../ThemeProvider";
import { getMonthlyNote, getAnnualNote } from "@/lib/companyObservations";

export default function NotesEmailDialog({ open, onClose, company, filterDate }) {
  const { theme } = useTheme();
  const [email, setEmail] = useState(company?.contact_email || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const ref = filterDate || new Date();
  const viewY = ref.getFullYear();
  const viewM = ref.getMonth() + 1;

  const notesMonthly = String(getMonthlyNote(company, viewY, viewM) || "").trim();
  const notesAnnual = String(getAnnualNote(company, viewY) || "").trim();
  const notesGeneral = String(company?.notes || "").trim();
  const hasObservations = notesMonthly || notesAnnual || notesGeneral;

  useEffect(() => {
    if (!open) return;
    setEmail(company?.contact_email || "");
    setError("");
    setSuccess("");
  }, [open, company?.contact_email]);

  const handleSendEmail = async () => {
    if (!email || !hasObservations) {
      setError("E-mail e pelo menos uma observação (mensal, anual ou geral) são obrigatórios");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await dbClient.integrations.Core.SendEmail({
        to: email,
        subject: `Observações - ${company.name}`,
        body: `
Olá,

Segue as observações sobre a empresa ${company.name}:

--- Observação mensal (${String(viewM).padStart(2, "0")}/${viewY}) ---
${notesMonthly || "(nenhuma)"}

--- Observação anual (${viewY}) ---
${notesAnnual || "(nenhuma)"}

--- Observação geral ---
${notesGeneral || "(nenhuma)"}

---
Enviado pelo sistema de gestão empresarial.
        `.trim(),
      });
      setSuccess("E-mail enviado com sucesso.");
    } catch (err) {
      setError(err.message || "Erro ao enviar email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className={`${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>Enviar Observações por Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold mb-2">Empresa:</p>
            <p className="text-sm">{company?.name}</p>
          </div>

          <div className="space-y-2">
            <Label>Observação mensal ({String(viewM).padStart(2, "0")}/{viewY})</Label>
            <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
              {notesMonthly || <span className="text-gray-500">(vazio)</span>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observação anual ({viewY})</Label>
            <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
              {notesAnnual || <span className="text-gray-500">(vazio)</span>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observação geral</Label>
            <div className={`p-3 rounded text-sm ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
              {notesGeneral || <span className="text-gray-500">(vazio)</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Email Destinatário *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="text-sm text-green-700 bg-green-50 dark:bg-green-900/20 p-2 rounded">
              {success}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSendEmail}
            disabled={loading || !email || !hasObservations}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? "Enviando..." : "Enviar Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
