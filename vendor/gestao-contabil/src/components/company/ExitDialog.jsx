import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DatePicker from "../DatePicker";

export default function ExitDialog({ open, onClose, onConfirm, company, exitType }) {
  const [exitDate, setExitDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");

  const label = exitType === "baixa" ? "Baixa" : "Saída";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Confirmar {label} — {company?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Data da {label}</Label>
            <DatePicker date={exitDate} onChange={setExitDate} />
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { onConfirm(exitDate, reason); onClose(); }} className={exitType === "baixa" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}>
            Confirmar {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}