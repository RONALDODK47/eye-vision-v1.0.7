import React, { useEffect, useState } from "react";
import { dbClient } from "@/api/dbClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTheme } from "../ThemeProvider";
import { openWhatsAppChat } from "@/lib/whatsappOpenUrl";

export default function TaskNotesEmailDialog({ open, onClose, task, company, onSave }) {
  const { theme } = useTheme();
  const [notes, setNotes] = useState(task?.notes || "");
  const [email, setEmail] = useState(company?.contact_email || "");
  const [phone, setPhone] = useState(company?.contact_phone || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [tab, setTab] = useState("notes"); // notes, email

  useEffect(() => {
    if (!open) return;
    setNotes(task?.notes || "");
    setEmail(company?.contact_email || "");
    setPhone(company?.contact_phone || "");
    setError("");
    setSuccess("");
    setTab("notes");
  }, [open, task?.id, task?.notes, company?.contact_email, company?.contact_phone]);

  const handleSaveNotes = async () => {
    if (task?.id) {
      await dbClient.entities.CompanyTask.update(task.id, { notes });
      onSave?.();
      onClose();
    }
  };

  const handleSendEmail = async () => {
    if (!email) {
      setError("Email é obrigatório");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    
    try {
      await dbClient.integrations.Core.SendEmail({
        to: email,
        subject: `Tarefa: ${task?.name} - ${company?.name}`,
        body: `
Olá,

Segue informações sobre a tarefa:

Tarefa: ${task?.name}
Empresa: ${company?.name}
Frequência: ${task?.frequency === "mensal" ? "Mensal" : "Anual"}
${task?.completed ? `Status: Concluída em ${task?.completed_date}` : "Status: Pendente"}

Observações:
${notes || "Sem observações"}

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
      <DialogContent aria-describedby={undefined} className={`max-w-md ${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"}`}>
        <DialogHeader>
          <DialogTitle>{task?.name}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setTab("notes")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === "notes"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Observações
          </button>
          <button
            onClick={() => setTab("enviar")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === "enviar"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Enviar
          </button>
        </div>

        {/* Notes Tab */}
        {tab === "notes" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Empresa: {company?.name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {task?.frequency === "mensal" ? "📅 Mensal" : "📆 Anual"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Adicione observações sobre esta tarefa..."
                className="min-h-32"
              />
            </div>
          </div>
        )}

        {/* Enviar Tab */}
        {tab === "enviar" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-2">Tarefa:</p>
              <p className="text-sm">{task?.name}</p>
            </div>

            <div className="space-y-2">
              <Label>Observações:</Label>
              <div className={`p-3 rounded text-sm max-h-24 overflow-y-auto ${theme === "dark" ? "bg-gray-800" : "bg-gray-50"}`}>
                {notes || "Sem observações"}
              </div>
            </div>

            {/* Email Section */}
            <div className="space-y-2">
              <Label>📧 Enviar por Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
              />
              <Button 
                onClick={handleSendEmail} 
                disabled={loading || !email}
                variant="outline"
                className="w-full"
              >
                {loading ? "Enviando..." : "Enviar Email"}
              </Button>
            </div>

            {/* WhatsApp Section */}
            <div className="space-y-2">
              <Label>💬 Enviar por WhatsApp</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="11999999999 (com código do país)"
              />
              <Button 
                onClick={() => {
                  if (!phone) {
                    setError("Telefone é obrigatório para WhatsApp");
                    return;
                  }
                  const cleanPhone = phone.replace(/\D/g, "");
                  const message = `Tarefa: ${task?.name}
Empresa: ${company?.name}

Observações:
${notes || "Sem observações"}`;
                  openWhatsAppChat(cleanPhone, message);
                }}
                variant="outline"
                className="w-full"
              >
                Abrir WhatsApp
              </Button>
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {tab === "notes" && (
            <Button onClick={handleSaveNotes} className="bg-indigo-600 hover:bg-indigo-700">
              Salvar Observações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}