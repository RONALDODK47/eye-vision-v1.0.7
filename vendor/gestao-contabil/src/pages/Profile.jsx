import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { dbClient } from "@/api/dbClient";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";
import { KeyRound, UserRound } from "lucide-react";
import {
  GestaoPageHeader,
  GestaoPanel,
  gestaoNativeBtnPrimary,
} from "@/components/GestaoEyeVisionChrome";

export default function Profile() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { user, requestPasswordReset } = useAuth();
  const uid = user?.uid;
  const firebaseEmail = String(user?.email || "").trim().toLowerCase();
  const [nextUsername, setNextUsername] = useState("");
  const [pwdEmailConfirm, setPwdEmailConfirm] = useState("");
  const [busyMsg, setBusyMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profilePage", uid],
    queryFn: async () => {
      if (!uid) return null;
      const snap = await getDoc(doc(db, "user_profiles", uid));
      return snap.exists() ? snap.data() : {};
    },
    enabled: !!uid,
  });

  const loginName = String(profile?.gc_login_username || "").trim() || "—";

  const renameMut = useMutation({
    mutationFn: async (usernameRaw) => {
      if (!uid || !firebaseEmail) throw new Error("Sessão inválida.");
      const avail = await dbClient.entities.LoginUsername.isAvailable(usernameRaw, uid);
      if (!avail) throw new Error("Este nome já está ocupado.");
      await dbClient.entities.LoginUsername.claimForUid({
        uid,
        email: firebaseEmail,
        usernameRaw,
      });
    },
    onSuccess: () => {
      setNextUsername("");
      setBusyMsg("Nome atualizado.");
      queryClient.invalidateQueries({ queryKey: ["profilePage", uid] });
      queryClient.invalidateQueries({ queryKey: ["userProfileMandatoryUsername", uid] });
    },
    onError: (err) => {
      setBusyMsg(err?.message || "Erro ao alterar nome.");
    },
  });

  const sendPwdReset = async () => {
    setPwdMsg("");
    const typed = pwdEmailConfirm.trim().toLowerCase();
    if (typed !== firebaseEmail) {
      setPwdMsg("Escreva exatamente o mesmo Gmail registado nesta conta para enviarmos a redefinição.");
      return;
    }
    const ok = await requestPasswordReset(typed);
    if (ok) {
      setPwdMsg(
        "E-mail enviado com um link para nova palavra-passe. Abra a mensagem no Gmail, use o link com segurança e depois inicie sessão nesta app normalmente."
      );
      setPwdEmailConfirm("");
    }
  };

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Perfil"
        subtitle="Altere o nome de entrada ou peça nova palavra-passe pelo Gmail da conta"
      />

      <GestaoPanel className="p-5 space-y-4 max-w-lg">
        <h2 className="font-semibold flex items-center gap-2">
          <UserRound className="w-5 h-5" />
          Nome de utilizador atual
        </h2>
        <p className="text-lg font-medium">{loginName}</p>
        <p className="text-xs text-muted-foreground">
          Este é o código que deve escrever no ecrã de entrada com a palavra-passe. Não use o Gmail ao iniciar sessão —
          apenas aqui quando precisamos de segurança.
        </p>
        <div className="space-y-2">
          <Label htmlFor="new-user">Alterar nome de utilizador</Label>
          <Input
            id="new-user"
            value={nextUsername}
            onChange={(ev) => setNextUsername(ev.target.value)}
            placeholder="Novo nome (ex.: maria_escritorio)"
            autoComplete="off"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!nextUsername.trim() || renameMut.isPending}
            onClick={() => {
              setBusyMsg("");
              renameMut.mutate(nextUsername.trim());
            }}
          >
            {renameMut.isPending ? "A guardar..." : "Guardar novo nome"}
          </Button>
          {busyMsg ? <p className="text-sm text-emerald-600">{busyMsg}</p> : null}
          {renameMut.isError ? (
            <p className="text-sm text-red-600">{renameMut.error?.message || ""}</p>
          ) : null}
        </div>
      </GestaoPanel>

      <GestaoPanel className="p-5 space-y-4 max-w-lg border-amber-400/60 bg-amber-50/80">
        <h2 className="font-semibold flex items-center gap-2">
          <KeyRound className="w-5 h-5" />
          Palavra-passe usando o Gmail
        </h2>
        <p className="text-xs text-muted-foreground">
          Confirme o Gmail desta conta e enviamos o processo habitual de recuperação do Firebase ao endereço real (nunca
          usamos apenas o nome de utilizador aqui).
        </p>
        <p className="text-sm break-all">
          Gmail registado nesta conta: <strong>{firebaseEmail || "—"}</strong>
        </p>
        <div className="space-y-2">
          <Label htmlFor="pwd-mail">Digite novamente esse Gmail para confirmar</Label>
          <Input
            id="pwd-mail"
            type="email"
            value={pwdEmailConfirm}
            onChange={(ev) => setPwdEmailConfirm(ev.target.value)}
            placeholder="Igual ao registado ao criar conta"
          />
          <Button type="button" className={gestaoNativeBtnPrimary} onClick={() => sendPwdReset()}>
            Enviar redefinição de palavra-passe por e-mail
          </Button>
          {pwdMsg ? <p className="text-sm text-gray-700">{pwdMsg}</p> : null}
        </div>
      </GestaoPanel>
    </div>
  );
}
