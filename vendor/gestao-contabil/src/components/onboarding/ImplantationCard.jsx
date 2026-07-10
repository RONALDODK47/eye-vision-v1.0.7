import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { useTheme } from "../ThemeProvider";
import { cn } from "@/lib/utils";
import { formatCompanySectorResponsiblesCompact } from "@/lib/companySectorResponsibles";

export const DEFAULT_IMPLANTATION_STEPS = [];

function StepRow({ label, done, isCompleted, onToggle, onRemove, theme }) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
      done
        ? theme === "dark" ? "bg-emerald-950/40" : "bg-emerald-50"
        : theme === "dark" ? "bg-gray-800/50" : "bg-gray-50"
    }`}>
      {isCompleted ? (
        done
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          : <Circle className="w-4 h-4 text-gray-400 shrink-0" />
      ) : (
        <Checkbox checked={done} onCheckedChange={onToggle} className="shrink-0" />
      )}
      <span className={`text-sm flex-1 ${done ? "line-through text-gray-400" : ""}`}>{label}</span>
      {!isCompleted && onRemove && (
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function AddStepRow({ onAdd, theme: _theme }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2 mt-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nova etapa..."
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
          }
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-8"
        disabled={!value.trim()}
        onClick={() => { onAdd(value.trim()); setValue(""); }}
      >
        <Plus className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function ImplantationCard({
  company,
  onStepToggle,
  onUpdateSteps,
  onDelete,
  isCompleted,
  viewPrefs = {},
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const showCnpj = viewPrefs.showCnpj !== false;
  const showResponsible = viewPrefs.showResponsible !== false;
  const showDates = viewPrefs.showDates !== false;
  const compactCards = viewPrefs.compactCards === true;

  const steps = company.implantation_steps || {};
  const removedKeys = company.implantation_removed_steps || [];
  const customSteps = company.implantation_custom_steps || [];

  // Filter default steps by section and removed
  const visibleDefault = (section) =>
    DEFAULT_IMPLANTATION_STEPS.filter((s) => s.section === section && !removedKeys.includes(s.key));

  // Custom steps per section stored as "section:label"
  const customEtapas = customSteps.filter((s) => s.startsWith("etapas:")).map((s) => s.slice(7));
  const customParametros = customSteps.filter((s) => s.startsWith("parametros:")).map((s) => s.slice(11));

  // Count all for progress
  const allVisible = [
    ...visibleDefault("etapas"),
    ...visibleDefault("parametros"),
    ...customEtapas.map((l, i) => ({ key: `custom_etapas_${i}`, label: l })),
    ...customParametros.map((l, i) => ({ key: `custom_parametros_${i}`, label: l })),
  ];
  const completedCount = allVisible.filter((s) => steps[s.key]).length;
  const total = allVisible.length;
  const allDone = total > 0 && completedCount === total;
  const progress = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const handleRemoveDefault = (key, _section) => {
    const newRemoved = [...removedKeys, key];
    onUpdateSteps(company, { implantation_removed_steps: newRemoved });
  };

  const handleAddCustom = (section, label) => {
    const entry = `${section}:${label}`;
    const newCustom = [...customSteps, entry];
    onUpdateSteps(company, { implantation_custom_steps: newCustom });
  };

  const handleRemoveCustom = (section, index) => {
    const prefix = `${section}:`;
    const filtered = customSteps.filter((s) => s.startsWith(prefix));
    const toRemove = filtered[index];
    const newCustom = customSteps.filter((s) => s !== toRemove);
    onUpdateSteps(company, { implantation_custom_steps: newCustom });
  };

  const SectionBlock = ({ title, section, customList }) => (
    <div className="space-y-2">
      <p className={`text-xs font-semibold uppercase tracking-wider ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
        {title}
      </p>
      {visibleDefault(section).length === 0 && customList.length === 0 && (
        <p className={`text-xs ${theme === "dark" ? "text-gray-600" : "text-gray-500"}`}>
          Sem tarefas por padrão. Adicione abaixo.
        </p>
      )}
      {visibleDefault(section).map((step) => (
        <StepRow
          key={step.key}
          label={step.label}
          done={!!steps[step.key]}
          isCompleted={isCompleted}
          onToggle={(checked) => onStepToggle(company, step.key, !!checked)}
          onRemove={() => handleRemoveDefault(step.key, section)}
          theme={theme}
        />
      ))}
      {customList.map((label, i) => {
        const key = `custom_${section}_${i}`;
        return (
          <StepRow
            key={key}
            label={label}
            done={!!steps[key]}
            isCompleted={isCompleted}
            onToggle={(checked) => onStepToggle(company, key, !!checked)}
            onRemove={() => handleRemoveCustom(section, i)}
            theme={theme}
          />
        );
      })}
      {!isCompleted && <AddStepRow onAdd={(label) => handleAddCustom(section, label)} theme={theme} />}
    </div>
  );

  return (
    <Card className={`${theme === "dark" ? "bg-gray-900 border-gray-800" : "bg-white"} w-full overflow-hidden h-fit`}>
      <div className="h-1 w-full bg-gray-200 dark:bg-gray-800">
        <div
          className={`h-1 transition-all duration-500 ${allDone ? "bg-emerald-500" : "bg-indigo-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={compactCards ? "p-3" : "p-4"}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={cn("font-semibold truncate", compactCards ? "text-sm" : "")}>
                {company.code ? <span className="text-gray-500 mr-2">{company.code}</span> : null}
                {company.name}
              </h3>
              {isCompleted ? (
                <Badge className="bg-emerald-100 text-emerald-800 shrink-0">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Implantado
                </Badge>
              ) : total > 0 ? (
                <Badge variant="outline" className="shrink-0">{completedCount}/{total} etapas</Badge>
              ) : null}
            </div>
            <p className={`text-xs mt-0.5 ${theme === "dark" ? "text-gray-500" : "text-gray-400"}`}>
              {showCnpj ? (company.cnpj || "Sem CNPJ") : null}
              {showResponsible && formatCompanySectorResponsiblesCompact(company) ? (
                <span className="ml-2 font-medium text-indigo-600 dark:text-indigo-400 break-words">
                  • Resp.: {formatCompanySectorResponsiblesCompact(company)}
                </span>
              ) : null}
              {showDates && isCompleted && company.implantation_completed_date && (
                <span className="ml-2 text-emerald-600 font-medium">
                  • Concluído em {format(new Date(company.implantation_completed_date), "dd/MM/yyyy")}
                </span>
              )}
              {showDates && !isCompleted && company.implantation_start_date && (
                <span className="ml-2">• Iniciado em {format(new Date(company.implantation_start_date), "dd/MM/yyyy")}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onDelete(company); }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-5">
            <SectionBlock title="Etapas de Implantação" section="etapas" customList={customEtapas} />
            <SectionBlock title="Parâmetros" section="parametros" customList={customParametros} />
          </div>
        )}
      </div>
    </Card>
  );
}