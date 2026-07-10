import React, { useState } from "react";
import { dbClient } from "@/api/dbClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, ExternalLink, Trash2, Pencil } from "lucide-react";
import { useTheme } from "../components/ThemeProvider";
import CsvImportActions from "@/components/CsvImportActions";
import { getRowValue } from "@/lib/csvUtils";
import { cn } from "@/lib/utils";
import {
  GestaoPageHeader,
  GestaoRestrictedPanel,
  gestaoNativeBtnPrimary,
  gestaoNativeCard,
  gestaoNativeMuted,
} from "@/components/GestaoEyeVisionChrome";
import { useCloudAccess } from "@/lib/useCloudAccess";
import { useWorkspacePeerUids } from "@/hooks/useWorkspacePeerUids";
import { mergeIndexedDocs } from "@/lib/officeWorkspacePeers";

function SiteCard({ site, onEdit, onDelete, isDeleting, currentUid, canEditOffice }) {
  const labelCls = cn("font-medium", gestaoNativeMuted);
  const isMine = canEditOffice || (Boolean(currentUid) && (!site.uid || String(site.uid) === String(currentUid)));

  return (
    <Card className={cn("group transition-all hover:border-brand-border", gestaoNativeCard)}>
      <div className="p-4 flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <a
            href={site.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:opacity-80 flex items-center gap-2 break-words"
          >
            {site.name || "Sem nome"}
            {site.url ? <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" /> : null}
          </a>
          <p className={cn("text-xs break-all", gestaoNativeMuted)} title={site.url || ""}>
            <span className={labelCls}>URL: </span>
            {site.url?.trim() ? site.url : "—"}
          </p>
          <p className={cn("text-xs", gestaoNativeMuted)}>
            <span className={labelCls}>Categoria: </span>
            {site.category?.trim() ? site.category : "—"}
          </p>
          <p className={cn("text-xs leading-relaxed", gestaoNativeMuted)}>
            <span className={labelCls}>Descrição: </span>
            {site.description?.trim() ? site.description : "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-0.5">
          {isMine ? (
            <>
              <Button variant="ghost" size="icon" type="button" onClick={() => onEdit(site)} title="Editar">
                <Pencil className="w-4 h-4 text-indigo-400" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => onDelete(site.id)}
                disabled={isDeleting}
                title="Excluir"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function UsefulSites() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const myUid = user?.uid;
  const { isAdminEmail, isMasterUser, tabAccess } = useCloudAccess();
  const canEditOfficeContent = Boolean(isAdminEmail || isMasterUser);
  const { officePeerUids, stableOfficeUidsKey } = useWorkspacePeerUids();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  const { data: sites = [] } = useQuery({
    queryKey: ["usefulSites", myUid, isAdminEmail, stableOfficeUidsKey],
    queryFn: async () => {
      if (!myUid) return [];
      const rows = await mergeIndexedDocs(
        (peerUid) => dbClient.entities.UsefulSite.list(peerUid),
        officePeerUids.length ? officePeerUids : [myUid]
      );
      rows.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" })
      );
      return rows;
    },
    enabled: !!myUid,
    retry: 2,
  });

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setUrl("");
    setCategory("");
    setDescription("");
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (site) => {
    if (!canEditOfficeContent && String(site.uid || myUid || "") !== String(myUid || "")) {
      window.alert("Só o autor pode editar este link.");
      return;
    }
    setEditingId(site.id);
    setName(site.name || "");
    setUrl(site.url || "");
    setCategory(site.category || "");
    setDescription(site.description || "");
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const uid = myUid;
      if (!uid) throw new Error("Você precisa estar logado.");
      if (id) {
        const row = sites.find((s) => s.id === id);
        const ownerUid = String(row?.uid || uid).trim();
        if (!canEditOfficeContent && ownerUid !== String(uid).trim()) {
          throw new Error("Só o autor pode editar este link.");
        }
        await dbClient.entities.UsefulSite.update(id, payload);
        return { id };
      }
      return dbClient.entities.UsefulSite.create({ ...payload, uid });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usefulSites"] });
      setShowForm(false);
      resetForm();
    },
    onError: (err) => window.alert("Erro ao salvar o link: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }) => {
      const row = sites.find((s) => s.id === id);
      const ownerUid = String(row?.uid || myUid || "").trim();
      if (!canEditOfficeContent && (!myUid || ownerUid !== String(myUid).trim())) {
        throw new Error("Só o autor pode excluir este link.");
      }
      await dbClient.entities.UsefulSite.delete(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["usefulSites"] }),
    onError: (err) => window.alert("Erro ao excluir o link: " + err.message),
  });

  const categories = [...new Set(sites.map((s) => s.category).filter(Boolean))];

  const handleImportSites = async (rows) => {
    const uid = myUid;
    if (!uid) {
      throw new Error("Você precisa estar logado para importar.");
    }

    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const siteName = getRowValue(row, ["nome", "name"]);
      const siteUrl = getRowValue(row, ["url", "link"]);
      if (!siteName || !siteUrl) {
        skipped += 1;
        continue;
      }

      await dbClient.entities.UsefulSite.create({
        uid,
        name: siteName,
        url: siteUrl,
        category: getRowValue(row, ["categoria", "category"]),
        description: getRowValue(row, ["descricao", "descrição", "description"]),
      });
      created += 1;
    }

    await queryClient.invalidateQueries({ queryKey: ["usefulSites"] });
    return {
      message: `Importação concluída: ${created} sites criados, ${skipped} linhas ignoradas.`,
    };
  };

  const handleSave = () => {
    const payload = {
      name: name.trim(),
      url: url.trim(),
      category: category.trim(),
      description: description.trim(),
    };
    saveMutation.mutate({ id: editingId, payload });
  };

  const sitesGridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4";

  const renderSiteCard = (site) => (
    <SiteCard
      key={site.id}
      site={site}
      currentUid={myUid}
      canEditOffice={canEditOfficeContent}
      onEdit={openEdit}
      onDelete={(id) => deleteMutation.mutate({ id })}
      isDeleting={
        deleteMutation.isPending && deleteMutation.variables && deleteMutation.variables.id === site.id
      }
    />
  );

  if (!tabAccess.UsefulSites) {
    return (
      <GestaoRestrictedPanel message="Você não tem permissão para acessar os links úteis. Entre em contato com o administrador." />
    );
  }

  return (
    <div className="space-y-6">
      <GestaoPageHeader
        title="Links Úteis"
        subtitle="Links do escritório reunidos por token; só você edita ou remove os seus"
        actions={
          <>
          <Button onClick={openNew} className={gestaoNativeBtnPrimary}>
            <Plus className="w-4 h-4 mr-2" /> Novo Link
          </Button>
          <CsvImportActions
            templateFileName="modelo_sites_uteis.csv"
            templateHeaders={["nome", "url", "categoria", "descricao"]}
            templateRows={[
              ["Portal e-CAC", "https://cav.receita.fazenda.gov.br", "Governo", "Acesso a serviços da Receita Federal"],
            ]}
            onImportRows={handleImportSites}
          />
          </>
        }
      />

      {sites.length > 0 && (
        <div className={sitesGridClass}>
          {categories.map((cat) => (
            <React.Fragment key={cat}>
              <h3 className={cn("col-span-full mb-1 mt-3 first:mt-0", gestaoNativeMuted)}>{cat}</h3>
              {sites.filter((s) => s.category === cat).map((site) => renderSiteCard(site))}
            </React.Fragment>
          ))}
          {sites.filter((s) => !s.category).length > 0 && (
            <React.Fragment key="__sem_categoria">
              <h3 className={cn("col-span-full mb-1 mt-3", gestaoNativeMuted)}>Sem categoria</h3>
              {sites.filter((s) => !s.category).map((site) => renderSiteCard(site))}
            </React.Fragment>
          )}
        </div>
      )}

      {sites.length === 0 && <p className="text-center py-10 text-gray-400">Nenhum site adicionado ainda</p>}

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar site" : "Novo site"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do site" />
            </div>
            <div className="space-y-2">
              <Label>URL *</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Contabilidade, Governo..." />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrição"
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || !url.trim() || saveMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
