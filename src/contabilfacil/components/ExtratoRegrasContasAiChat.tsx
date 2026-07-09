/**
 * Painel IA nas regras: Corrigir, Implantar (sem regras) + chat em lotes.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { ListOrdered, Loader2, MessageSquare, PlusCircle, Send, Sparkles, Wrench } from 'lucide-react';
import { countAiInteligenciaDocs } from '../logic/aiInteligenciaStorage';

export type ExtratoRegrasChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export type ExtratoRegrasContasAiChatProps = {
  company: string;
  contaBanco: string;
  bancoNome: string;
  docsCount?: number;
  busy: boolean;
  message: string;
  uncoveredCount: number;
  /** Quantidade de regras já cadastradas neste banco. */
  regrasCount?: number;
  /** Corrige regras existentes + cobre descobertos. */
  onCorrigir: () => void;
  /** Implanta regras do zero quando o banco ainda não tem nenhuma. */
  onImplantar?: () => void;
  /** Rola/foca a lista de regras do banco. */
  onMostrarRegras?: () => void;
  /** Link textual para pastas (sem botão grande). */
  onOpenInteligencia?: () => void;
  /**
   * Chat livre: o usuário pede algo sobre as regras;
   * processa em lotes e aplica as sugestões.
   */
  onChat?: (userMessage: string) => Promise<{ ok: boolean; reply: string }>;
};

export default memo(function ExtratoRegrasContasAiChat({
  company,
  contaBanco,
  bancoNome,
  docsCount: docsCountProp,
  busy,
  message,
  uncoveredCount,
  regrasCount = 0,
  onCorrigir,
  onImplantar,
  onMostrarRegras,
  onOpenInteligencia,
  onChat,
}: ExtratoRegrasContasAiChatProps) {
  const [docsCount, setDocsCount] = useState(
    () => docsCountProp ?? countAiInteligenciaDocs(company),
  );
  const [chatMessages, setChatMessages] = useState<ExtratoRegrasChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDocsCount(docsCountProp ?? countAiInteligenciaDocs(company));
  }, [company, docsCountProp]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chatMessages, chatBusy]);

  const bancoOk = Boolean(contaBanco.trim());
  const sending = busy || chatBusy;
  const showImplantar = regrasCount === 0 && Boolean(onImplantar);

  const handleSendChat = async () => {
    const text = chatDraft.trim();
    if (!text || !onChat || !bancoOk || sending) return;

    const userMsg: ExtratoRegrasChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatDraft('');
    setChatBusy(true);
    try {
      const result = await onChat(text);
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.reply || (result.ok ? 'Pronto.' : 'Não foi possível processar o pedido.'),
        },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Falha no chat com a IA.',
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <div className="border border-brand-border bg-white flex flex-col w-full min-h-0">
      <div className="px-3 py-2 border-b border-brand-border flex items-center gap-2 shrink-0 bg-brand-sidebar/30">
        <Sparkles size={14} className="text-brand-text/70 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider">IA — regras do banco</p>
          <p className="text-[9px] text-brand-text/55 truncate">
            {bancoOk
              ? `Banco: ${bancoNome || contaBanco} · ${docsCount} doc(s) · ${regrasCount} regra(s)`
              : 'Escolha o banco no topo à esquerda'}
          </p>
        </div>
      </div>

      <div className="p-3 flex flex-col gap-3 min-h-0">
        <p className="text-[10px] text-brand-text/70 leading-snug">
          <strong>Corrigir</strong> audita regras vs Inteligência IA.
          {showImplantar ? (
            <>
              {' '}
              <strong>Implantar regra</strong> cria as regras do zero (em lotes).
            </>
          ) : null}{' '}
          No <strong>chat</strong>, diga o que fazer (ex.: jogar Polo Sul Climatização no fundo
          fixo) — a IA processa em lotes.
        </p>

        {docsCount === 0 ? (
          <p className="text-[9px] text-amber-800 leading-snug">
            Nenhum documento na Inteligência IA.
            {onOpenInteligencia ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onOpenInteligencia}
                  className="underline font-bold uppercase"
                >
                  Abrir pastas
                </button>{' '}
                e envie os arquivos antes.
              </>
            ) : (
              <> Envie documentos nas pastas de Inteligência IA antes.</>
            )}
          </p>
        ) : (
          <p className="text-[9px] text-green-800 font-bold uppercase">
            {docsCount} documento(s) prontos
          </p>
        )}

        {uncoveredCount > 0 ? (
          <p className="text-[9px] text-amber-800">
            {uncoveredCount} padrão(ões) do extrato ainda sem regra.
          </p>
        ) : bancoOk ? (
          <p className="text-[9px] text-green-800">
            Todos os padrões do extrato têm regra neste banco.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onCorrigir}
          disabled={sending || !bancoOk}
          className="technical-button-primary text-[12px] py-3 px-4 inline-flex items-center justify-center gap-2 disabled:opacity-40 w-full font-black uppercase tracking-wide"
          title="Corrige as regras do banco selecionado com IA"
        >
          {busy && !chatBusy ? (
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <Wrench size={18} aria-hidden="true" />
          )}
          {busy && !chatBusy
            ? 'Corrigindo regras…'
            : uncoveredCount > 0
              ? `IA Corrigir regras (${uncoveredCount})`
              : 'IA Corrigir regras'}
        </button>

        {showImplantar ? (
          <button
            type="button"
            onClick={onImplantar}
            disabled={sending || !bancoOk || uncoveredCount === 0}
            className="technical-button-primary text-[12px] py-3 px-4 inline-flex items-center justify-center gap-2 disabled:opacity-40 w-full font-black uppercase tracking-wide"
            title="Implanta regras do zero para os lançamentos sem regra (em lotes)"
          >
            {busy && !chatBusy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <PlusCircle size={18} aria-hidden="true" />
            )}
            {busy && !chatBusy
              ? 'Implantando regras…'
              : uncoveredCount > 0
                ? `Implantar regra (${uncoveredCount})`
                : 'Implantar regra'}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onMostrarRegras}
          disabled={!bancoOk || !onMostrarRegras}
          className="technical-button text-[11px] py-2.5 px-4 inline-flex items-center justify-center gap-2 disabled:opacity-40 w-full font-black uppercase tracking-wide"
          title="Mostra a lista de regras cadastradas deste banco"
        >
          <ListOrdered size={16} aria-hidden="true" />
          {regrasCount > 0 ? `Mostrar regras (${regrasCount})` : 'Mostrar regras'}
        </button>

        {message ? (
          <p
            className={`text-[9px] font-bold uppercase leading-snug ${
              busy ? 'text-amber-800' : 'text-green-800'
            }`}
          >
            {message}
          </p>
        ) : null}

        {onChat ? (
          <div className="border border-brand-border flex flex-col min-h-[200px] max-h-[320px]">
            <div className="px-2 py-1.5 border-b border-brand-border bg-brand-sidebar/20 flex items-center gap-1.5 shrink-0">
              <MessageSquare size={12} className="text-brand-text/60" aria-hidden="true" />
              <span className="text-[9px] font-black uppercase tracking-wider">
                Chat — peça algo à IA
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px] bg-brand-bg/40">
              {chatMessages.length === 0 && !chatBusy ? (
                <p className="text-[9px] text-brand-text/50 leading-snug">
                  Ex.: &quot;Contas com Polo Sul Climatização vão no fundo fixo de caixa&quot; —
                  processa em lotes e aplica.
                </p>
              ) : null}
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`text-[10px] leading-snug px-2 py-1.5 max-w-[95%] ${
                    m.role === 'user'
                      ? 'ml-auto bg-brand-sidebar/40 border border-brand-border'
                      : 'mr-auto bg-white border border-brand-border'
                  }`}
                >
                  <p className="text-[8px] font-black uppercase tracking-wider text-brand-text/45 mb-0.5">
                    {m.role === 'user' ? 'Você' : 'IA'}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              ))}
              {chatBusy ? (
                <div className="mr-auto text-[10px] px-2 py-1.5 bg-white border border-brand-border inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  Processando em lotes…
                </div>
              ) : null}
              <div ref={chatEndRef} />
            </div>

            <div className="p-2 border-t border-brand-border flex gap-1.5 shrink-0 bg-white">
              <textarea
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendChat();
                  }
                }}
                disabled={!bancoOk || sending}
                rows={2}
                placeholder={
                  bancoOk
                    ? 'Digite o que a IA deve fazer com as regras…'
                    : 'Selecione o banco primeiro'
                }
                className="flex-1 min-w-0 text-[10px] border border-brand-border px-2 py-1.5 resize-none disabled:opacity-40 uppercase"
              />
              <button
                type="button"
                onClick={() => void handleSendChat()}
                disabled={!bancoOk || sending || !chatDraft.trim()}
                className="technical-button-primary px-2.5 self-stretch inline-flex items-center justify-center disabled:opacity-40"
                title="Enviar para a IA"
              >
                {chatBusy ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={14} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});
