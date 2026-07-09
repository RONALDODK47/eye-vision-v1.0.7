import { Transaction, ScannedLine, ExtractionConfig } from '../types';
import {
  pickExtratoValorFromRowItems,
  resolveExtratoValorFromTexts,
} from './extratoMoneyParse';
import { runOcrPortugueseWords, preprocessForOcr } from '../../lib/imageOcrExtract';
import { refineOcrRowClusters } from '../../lib/aiOcrAssist';
import { getOcrCustomReplacements, getOcrDatePropagationMode } from '../../lib/ocrCloudRulesStorage';

// More specific money regex: requires at least one digit before the separator
// Modified to optionally treat a space as the final separator for cases where OCR misses the comma
const moneyRegex = /((?:[\(]?\s*[-+−]?\s*(?:R\$\s?)?[0-9OQoIl|SBZzGTgqs]+(?:[\.\s]*[0-9OQoIl|SBZzGTgqs]+)*[,.\s]\s*[0-9OQoIl|SBZzGTgqs]{1,3}\s*[-−]?\s*[\)]?)(?:\s*[DC])?)/i;

export interface OcrRule {
  from: string;
  to: string;
}

export const DEFAULT_OCR_REPLACEMENTS: OcrRule[] = [
  { from: 'O', to: '0' },
  { from: 'o', to: '0' },
  { from: 'Q', to: '9' },
  { from: 'g', to: '9' },
  { from: 'q', to: '9' },
  { from: 'l', to: '1' },
  { from: 'L', to: '1' },
  { from: 'i', to: '1' },
  { from: 'I', to: '1' },
  { from: '|', to: '1' },
  { from: 'S', to: '5' },
  { from: 's', to: '5' },
  { from: 'B', to: '8' },
  { from: 'Z', to: '2' },
  { from: 'z', to: '2' },
  { from: 'G', to: '6' },
  { from: 'T', to: '7' }
];

export const getOcrReplacements = (): OcrRule[] => {
  const saved = getOcrCustomReplacements();
  if (saved?.length) return saved;
  return DEFAULT_OCR_REPLACEMENTS;
};

export const hasTwoDecimals = (valStr: string): boolean => {
    if (!valStr) return false;
    
    // 1. Minimum cleanup: remove leading/trailing noise and layout separators (|)
    const cleaned = valStr.trim()
        .replace(/^[^0-9\-+()−]+/, '') // Fix: remove leading junk before exploring digits/signs
        .replace(/^[|I1]\s*([-−+()])/g, '$1') // Fix: remove leading layout artifacts before a sign
        .replace(/([-+()−])\s*[|I1]\s+(?=[0-9])/g, '$1') // specifically remove | or I between sign and digits
        .replace(/\|+\s*$/, '');

    // 2. OCR fixes (dynamic custom replacements)
    let sanitized = cleaned;
    const rules = getOcrReplacements();
    for (const rule of rules) {
        if (rule.from) {
            const escapedFrom = rule.from.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regex = new RegExp(escapedFrom, 'g');
            sanitized = sanitized.replace(regex, rule.to || '');
        }
    }
        
    let s = sanitized.replace(/[^\d.,\s]/gi, '').trim();
    
    let lastComma = s.lastIndexOf(',');
    let lastDot = s.lastIndexOf('.');
    let lastSep = lastComma > lastDot ? lastComma : lastDot;
    let lastSpace = s.lastIndexOf(' ');
    
    if (lastSpace !== -1 && lastSpace > lastSep) {
        const afterSpace = s.substring(lastSpace + 1).replace(/[^\d]/g, '');
        if (afterSpace.length === 2) return true;
    }
    
    s = s.replace(/\s/g, '');
    lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    
    if (lastSep !== -1) {
        const decimalPart = s.substring(lastSep + 1).replace(/[^\d]/g, '');
        return decimalPart.length === 2;
    }
    
    return false;
};

const parseValue = (valStr: string): number => {
  if (!valStr) return 0;
  
  // 1. Clean up layout separators and junk (same as hasTwoDecimals)
  const cleaned = valStr.trim()
      .replace(/^[^0-9\-+()−]+/, '') // Leading junk
      .replace(/^[|I1]\s*([-−+()])/g, '$1') // Leading noise before sign (e.g. "1 -777")
      .replace(/([-+()−])\s*[|I1]\s+(?=[0-9])/g, '$1') // noise between sign and number with space (e.g. "- 1 777")
      .replace(/[|]$/, ''); // Trailing |

  // 2. Identify negativity/positivity
  const isNegative = /[-−(]/.test(cleaned.substring(0, 5)) || /\s[D]$/i.test(cleaned) || /[D]$/i.test(cleaned);
  const isPositive = /^[+]/.test(cleaned) || /\s[+]/.test(cleaned.substring(0, 5)) || /\s[C]$/i.test(cleaned) || /[C]$/i.test(cleaned);

  // 3. OCR character fixes (dynamic custom replacements)
  let sanitized = cleaned;
  const rules = getOcrReplacements();
  for (const rule of rules) {
      if (rule.from) {
          const escapedFrom = rule.from.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(escapedFrom, 'g');
          sanitized = sanitized.replace(regex, rule.to || '');
      }
  }

  let s = sanitized.replace(/R\$\s?|[()\-−+DC]/gi, '').trim();
  
  let lastComma = s.lastIndexOf(',');
  let lastDot = s.lastIndexOf('.');
  let lastSep = Math.max(lastComma, lastDot);
  let lastSpace = s.lastIndexOf(' ');
  
  // If there's a space that leaves exactly 2 digits at the end, and appears after any comma/dot, 
  // treat it as the decimal separator (OCR read comma as space)
  if (lastSpace !== -1 && lastSpace > lastSep) {
      const afterSpaceMatch = s.substring(lastSpace + 1).replace(/[^\d]/g, '');
      if (afterSpaceMatch.length === 2) {
          s = s.substring(0, lastSpace) + '.' + s.substring(lastSpace + 1);
      }
  }

  // Now remove all spaces
  s = s.replace(/\s/g, '');
  
  // Recalculate separators after removing spaces (this handles cases where normal separators exist)
  lastComma = s.lastIndexOf(',');
  lastDot = s.lastIndexOf('.');
  lastSep = Math.max(lastComma, lastDot);

  let finalValue = 0;
  if (lastSep === -1) {
      finalValue = parseFloat(s) || 0;
  } else {
      // In bank statements, the last separator is ALWAYS the decimal one.
      // We treat everything before it as the integer part (ignoring thousand separators).
      const integerPart = s.substring(0, lastSep).replace(/[.,]/g, '');
      const decimalPart = s.substring(lastSep + 1).replace(/[^\d]/g, '');
      
      // We only take the first 2 digits of the decimal part to avoid OCR noise
      finalValue = parseFloat(integerPart + '.' + decimalPart.substring(0, 2)) || 0;
  }

  if (!Number.isFinite(finalValue) || finalValue > 99_999_999) {
    finalValue = 0;
  }

  return isNegative ? -Math.abs(finalValue) : Math.abs(finalValue);
};

/** Parser monetário do Extrato Vision (OCR, PDF posicional, colunas mapeadas). */
export { parseValue as parseOcrMoneyValue };

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// --- Helper Functions ---

export const BANK_HEADER_PATTERNS = [
  /^Extrato\s+(de\s+)?Conta/i,
  /^Extrato$/i,
  /^Per[íi]odo\s+de/i,
  /^Ag[êe]ncia\s*:/i,
  /^Conta\s*:/i,
  /^Nome\s*:/i,
  /^CPF\s*\/\s*CNPJ/i,
  /^(CPF|CNPJ)\s*[:\d]/i,
  /^P[áa]gina\s+\d+/i,
  /^Folha\s+\d+/i,
  /^Demonstrativo\s+de/i,
  /^SAC\s*:/i,
  /^Ouvidoria\s*:/i,
  /^Central\s+de\s+Atendimento/i,
  /^Para\s+uso\s+do\s+banco/i,
  /^Rendimento\s+l[íi]quido$/i,
  /^Movimentaç[õo]es$/i,
  /^Aviso\s+de\s+Privacidade$/i,
  /^Termos\s+de\s+Uso$/i,
  /^Internet\s+Banking$/i,
  /^Banco\s+[A-Z\s]+S\.A\.$/i,
  /^Data\s+d[eo]\s+Extrato/i,
  /^Data\s+de\s+Emiss[ãa]o/i,
  /^Cheque\s+Especial$/i,
  /^Resumo$/i,
  /^Data\s+Hist[óo]rico\s+Valor$/i,
  /^Descri[çc][ãa]o\s+Valor$/i,
  /^Data\s+Movimentaç[ãa]o\s+Tipo\s+Documento\s+Valor$/i,
  /^Tribanco\s+Online$/i,
  /^Data\s+da\s+Impress[ãa]o/i,
  /^Usu[áa]rio\s*:/i,
  /^Lan[çc]amentos\s+da\s+CONTA\s+DIGITAL/i,
  /^https?:\/\//i,
  /^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}(:\d{2})?$/, // só data/hora de impressão, sem texto após
  /^Lan[çc]amentos\s+Futuros$/i,
  /^N[ãa]o\s+h[áa]\s+lan[çc]amentos$/i,
  /^Posi[çc][ãa]o\s+da\s+CONTA$/i,
  /^Sujeito\s+a\s+altera[çc][õo]es$/i,
  /^Informa[çc][õo]es\s+do\s+dia$/i
];

/** Número de página estilo impressão ("1 / 6"), sem confundir com data DD/MM inteira quando ambos são pequenos. */
function isBrowserPrintPageFraction(s: string): boolean {
  const m = /^\s*(\d{1,4})\s*\/\s*(\d{1,4})\s*$/.exec(s);
  if (!m) return false;
  const cur = Number(m[1]);
  const tot = Number(m[2]);
  if (!Number.isFinite(cur) || !Number.isFinite(tot)) return false;
  if (tot < 1 || tot > 800) return false;
  /** Páginas: cur sempre ≤ total; dias/meses tipo 15/06 geram cur > tot e não tratamos como página. */
  return cur <= tot;
}

/** Cabeçalho/rodapé de impressão do navegador (URL SPA, página, carimbo data/hora+nome do banco) — ignorar sempre. */
export function isBankStatementNoiseLine(raw: string): boolean {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return true;

  for (const p of BANK_HEADER_PATTERNS) {
    if (p.test(s)) return true;
  }

  // URL de SPA / internet banking (BB e similares) — mesmo com texto colado antes/depois pelo PDF
  if (/https?:\/\/[^\s]*autoatendimento\.bb\.com\.br/i.test(raw)) return true;
  if (/https?:\/\/[^\s]*\.bb\.com\.br[^\s]*#\//i.test(raw)) return true;
  if (/https?:\/\/[^\s]+\/apf-apj-autoatendimento\//i.test(raw)) return true;

  // BB / SPA no path (captura fragmentos OCR de ~2Fconsultas ou #/template/)
  if (/autoatendimento\.bb\.com\.br/i.test(s)) return true;
  if (/\/apf-apj-autoatendimento\//i.test(s)) return true;
  if (/\/index\.html\?[^\s#/]*#\//i.test(s)) return true;
  if (/~2[Ff]consultas/i.test(s) || /#\/template\//i.test(s)) return true;

  if (isBrowserPrintPageFraction(s)) return true;

  /** Carimbo "11/08/2025, 15:19" só (com ou sem segundos) ou seguido de nome institucional curto no rodapé. */
  const printStampStrict = /^\d{2}\/\d{2}\/\d{4}\s*,\s*\d{1,2}:\d{2}(:\d{2})?\s*$/;
  if (printStampStrict.test(s)) return true;

  /** Carimbo + nome do banco (mesma linha, típico de impressão da página BB). */
  const printStampRest = /^\d{2}\/\d{2}\/\d{4}\s*,\s*\d{1,2}:\d{2}(?::\d{2})?\s+(.+)$/i.exec(s);
  if (printStampRest && printStampRest[1]) {
    const suffix = printStampRest[1].trim();
    if (suffix.length < 52 && /^banco\s+do\s+brasil$/i.test(suffix)) return true;
    if (suffix.length < 44 && /^(banco\s+)?bradesco(\s+bank)?$/i.test(suffix)) return true;
    if (suffix.length < 44 && /^it[aá]u(\s+unibanco)?$/i.test(suffix)) return true;
    if (suffix.length < 44 && /^santander$/i.test(suffix)) return true;
    if (suffix.length < 52 && /^caixa(\s+econ[oô]mica(\s+federal)?)?$/i.test(suffix)) return true;
  }

  /** Rodapé com só nome de banco institucional (uma linha). */
  if (s.length < 72 && /^banco\s+do\s+brasil\s*$/i.test(s)) return true;

  return false;
}

export const sanitizeHistory = (text: string): string => {
  if (!text) return "";

  let cleaned = text.toUpperCase();

  // 0. Pre-limpeza de ruído de OCR e caracteres invisíveis
  cleaned = cleaned
    .replace(/[|_>]{2,}/g, ' ')
    .replace(/\.{3,}/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/\*{2,}[\d.*\-—=]+\*{2,}/g, ' ') // Dados mascarados (Ex: ****1234)
    .replace(/\b\d{2}:\d{2}(:\d{2})?\b/g, ' '); // Horários isolados

  // 1. Limpeza de Ruído (Regex)
  // CPF: 000.000.000-00
  cleaned = cleaned.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ');
  // CNPJ: 00.000.000/0000-00
  cleaned = cleaned.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, ' ');
  // IDs de transação e números longos (Nubank/Pix costumam ter IDs alfanuméricos longos)
  cleaned = cleaned.replace(/\b[A-Z0-9]{15,}\b/g, ' '); 
  // Removendo sequências de números isolados longos (mais de 6 dígitos)
  cleaned = cleaned.replace(/\b\d{7,}\b/g, ' ');

  // 4. Remoção de Duplicidade Visual (Ex: PIX PIX)
  const words = cleaned.split(/\s+/).filter(Boolean);
  const uniqueWords: string[] = [];
  words.forEach((word, i) => {
    if (word !== words[i - 1]) {
      uniqueWords.push(word);
    }
  });
  cleaned = uniqueWords.join(' ');

  // 5. Saída Limpa (Core do histórico)
  cleaned = cleaned
    .replace(/[^\w\sÀ-ÿ\-]/g, ' ') // Remove caracteres especiais exceto hífen e acentuados
    .replace(/\s{2,}/g, ' ')
    .trim();

  return cleaned;
};

const MONTHS_PT: Record<string, string> = {
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
  'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
  'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04', 'maio': '05', 'junho': '06',
  'julho': '07', 'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

/**
 * High-Tech OCR Date Correction
 * Fixes common character swaps that occur during OCR on financial documents.
 */
const fixOcrDate = (s: string): string => {
  let sanitized = s;
  const rules = getOcrReplacements();
  for (const rule of rules) {
      if (rule.from) {
          const escapedFrom = rule.from.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(escapedFrom, 'g');
          sanitized = sanitized.replace(regex, rule.to || '');
      }
  }
  return sanitized;
};

export const extractDateFromText = (text: string, statementYear: string): { normalized: string, original: string } | null => {
  // 1. Try Compact YYYYMMDD
  const compactMatch = text.match(/\b(20[1-2][0-9])(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (compactMatch) {
      return { normalized: `${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]}`, original: compactMatch[0] };
  }

  // 2. Try Extensive Date
  const extMatch = text.match(/(?:([0-3OQoIlLi|SBZzGT]?[0-9OQoIlLi|SBZzGT])\s*(?:(?:de|\/|\-|\.|\,)\s*|\s+))?([a-zA-ZçÇ]{3,})\s*(?:de|\/|\-|\.|\,)?\s*([0-9OQoIlLi|SBZzGT]{2,4})?/i);
  if (extMatch) {
      const monthRaw = extMatch[2].toLowerCase();
      let month = '';
      for (const key in MONTHS_PT) {
          if (monthRaw.startsWith(key)) {
              month = MONTHS_PT[key];
              break;
          }
      }
      
      if (month) {
          let day = '01';
          if (extMatch[1]) {
              day = fixOcrDate(extMatch[1]).padStart(2, '0');
          }
          let year = extMatch[3] ? fixOcrDate(extMatch[3]) : statementYear;
          if (year && year.length === 2) year = '20' + year;
          
          const d = parseInt(day);
          if (d >= 1 && d <= 31) {
             const normalized = year ? `${day}/${month}/${year}` : `${day}/${month}`;
             return { normalized, original: extMatch[0] };
          }
      }
  }

  // 3. Try Standard/OCR Date
  const stdMatch = text.match(/\b([0-3OQoIl|SBZzGT]?[0-9OQoIl|SBZzGT])[\/\-\|]([0-1OQoIl|SBZzGT]?[0-9OQoIl|SBZzGT])(?:[\/\-\|]([0-9OQoIl|SBZzGT]{2,4}))?\b/i);
  if (stdMatch) {
      const day = fixOcrDate(stdMatch[1]).padStart(2, '0');
      const month = fixOcrDate(stdMatch[2]).padStart(2, '0');
      let year = stdMatch[3] ? fixOcrDate(stdMatch[3]) : statementYear;
      
      const d = parseInt(day);
      const m = parseInt(month);
      
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
          if (year && year.length === 2) year = '20' + year;
          const normalized = year ? `${day}/${month}/${year}` : `${day}/${month}`;
          return { normalized, original: stdMatch[0] };
      }
  }
  
  // 4. Try dotted date DD.MM.YYYY
  const dotMatch = text.match(/\b([0-3OQoIl|SBZzGT]?[0-9OQoIl|SBZzGT])\.([0-1OQoIl|SBZzGT]?[0-9OQoIl|SBZzGT])\.([0-9OQoIl|SBZzGT]{2,4})\b/i);
  if (dotMatch) {
      const day = fixOcrDate(dotMatch[1]).padStart(2, '0');
      const month = fixOcrDate(dotMatch[2]).padStart(2, '0');
      let year = fixOcrDate(dotMatch[3]);
      
      const d = parseInt(day);
      const m = parseInt(month);
      
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
          if (year && year.length === 2) year = '20' + year;
          return { normalized: `${day}/${month}/${year}`, original: dotMatch[0] };
      }
  }

  return null;
};

export const resolveYear = (dateStr: string, statementYear: string): string => {
  if (!dateStr) return "";
  
  // Normalize separators
  let normalized = dateStr.replace(/[\.\-]/g, '/');
  
  // Handle "DD de Mês de YYYY"
  const longMatch = normalized.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (longMatch) {
    const day = longMatch[1].padStart(2, '0');
    const monthName = longMatch[2].toLowerCase();
    const month = (MONTHS_PT[monthName] || 1).toString().padStart(2, '0');
    const year = longMatch[3];
    return `${day}/${month}/${year}`;
  }

  // Basic DD/MM/YYYY or DD/MM
  const parts = normalized.split('/');
  if (parts.length >= 2) {
    const day = fixOcrDate(parts[0]).padStart(2, '0');
    const month = fixOcrDate(parts[1]).padStart(2, '0');
    let year = parts[2] ? fixOcrDate(parts[2]) : statementYear;
    
    if (year && year.length === 2) year = '20' + year;
    if (!year) return `${day}/${month}`;
    return `${day}/${month}/${year}`;
  }

  return dateStr;
};

export const dateToInt = (d: string): number => {
  if (!d) return 0;
  const m = d.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (!m) return 0;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3] || '0', 10);
  return year * 10000 + month * 100 + day;
};

export const advanceDate = (current: string, candidate: string): string => {
  if (!current) return candidate;
  if (!candidate) return current;
  
  const curInt = dateToInt(current);
  const candInt = dateToInt(candidate);
  
  // If candidate has a year and current doesn't, or vice versa, prioritize the one with more info
  const curHasYear = current.split('/').length === 3;
  const candHasYear = candidate.split('/').length === 3;
  
  if (candHasYear && !curHasYear) return candidate;
  if (!candHasYear && curHasYear) {
      // Try to see if candidate fits in current year
      const year = current.split('/')[2];
      const fullCand = `${candidate}/${year}`;
      return fullCand;
  }

  // If both have years or both don't, trust the candidate if it's a valid transition
  // In bank statements, dates usually move in one direction (asc or desc)
  // We allow jumps but try to stay within a reasonable range
  return candidate; 
};

export const extractStatementYear = (text: string): string => {
  const periodo = text.match(
    /(?:per[ií]odo|refer[eê]ncia|compet[eê]ncia|extrato\s+de)\s*:?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\s*(?:a|até|–|-)\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.](\d{2,4}))/i,
  );
  if (periodo?.[2]) {
    const y = periodo[2].replace(/\D/g, '');
    if (y.length === 4) return y;
    if (y.length === 2) return `20${y}`;
  }
  const m = text.match(/\b(20\d{2})\b/);
  return m ? m[1] : '';
};

const DATE_NOISE_PREFIX =
  /emitido|impresso|gerado|emiss[ãa]o|p[áa]gina|vencimento|venc\.|venc\b|agendado|previs[ãa]o|vence\s+em|per[ií]odo|refer[eê]ncia|compet[eê]ncia|saldo\s+anterior|data\s+do\s+extrato/i;

/** Agrupa itens PDF/OCR na mesma linha visual (tolerância proporcional à altura do texto). */
function clusterTextItemsIntoRows(items: { y: number; h?: number; x: number; str: string; w?: number }[]): any[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const avgH = sorted.reduce((s, it) => s + (it.h || 10), 0) / sorted.length;
  const tol = Math.max(10, Math.min(14, avgH * 0.85));

  const rows: any[][] = [];
  let currentRow = [sorted[0]];
  let rowSumY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const avgY = rowSumY / currentRow.length;
    if (Math.abs(item.y - avgY) < tol) {
      currentRow.push(item);
      rowSumY += item.y;
    } else {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [item];
      rowSumY = item.y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);
  return rows;
}

function historyGapThresholdPx(row: { h?: number }[]): number {
  const avgH = row.reduce((s, it) => s + (it.h || 10), 0) / Math.max(1, row.length);
  return Math.max(48, avgH * 3.5);
}

/** Traço, célula vazia, só hora ou lixo OCR na coluna data — não é data válida. */
export function isExtratoDatePlaceholder(s: string | undefined | null): boolean {
  const t = String(s ?? '').trim();
  if (!t) return true;
  const compact = t.replace(/\s+/g, '');
  if (/^[-–—_./\\|]+$/.test(compact)) return true;
  if (/^(n\/?a|null|vazio|s\/d|nd|n\.?d\.?)$/i.test(compact)) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(compact)) return true;
  return false;
}

/** Repete a última data válida nos lançamentos do mesmo dia (extrato bancário). */
export function propagateTransactionDates(transactions: Transaction[]): Transaction[] {
  if (typeof window !== 'undefined') {
    if (getOcrDatePropagationMode() === 'one-per-tx') {
      return transactions;
    }
  }
  let last = '';
  return transactions.map((t) => {
    const d = String(t.data ?? '').trim();
    if (!isExtratoDatePlaceholder(d) && extratoDateToIso(d)) {
      last = d;
      return t;
    }
    if (last) {
      return { ...t, data: last, isInheritedDate: true };
    }
    return t;
  });
}

/** Data efetiva do lançamento (coluna, linha ou contexto herdado). */
export function resolveTransactionDate(
  dateExtraction: { normalized: string; original: string } | null,
  dateStrColumn: string,
  lastValidContextDate: string,
  statementYear: string,
): { data: string; isInherited: boolean } {
  const applyExtraction = (ext: { normalized: string; original: string } | null): string | null => {
    if (!ext || /^00\/00/.test(ext.normalized)) return null;
    let d = ext.normalized;
    if (d.split('/').length === 2 && statementYear) {
      d = `${d}/${statementYear}`;
    }
    return resolveYear(d, statementYear);
  };

  const fromRow = applyExtraction(dateExtraction);
  if (fromRow) return { data: fromRow, isInherited: false };

  const fromColumn = !isExtratoDatePlaceholder(dateStrColumn) && dateStrColumn.trim()
    ? applyExtraction(extractDateFromText(dateStrColumn.trim(), statementYear))
    : null;
  if (fromColumn) return { data: fromColumn, isInherited: false };

  if (typeof window !== 'undefined') {
    if (getOcrDatePropagationMode() === 'one-per-tx') {
      return { data: '', isInherited: true };
    }
  }

  let inherited = lastValidContextDate;
  if (inherited) {
    if (inherited.split('/').length === 2 && statementYear) {
      inherited = resolveYear(`${inherited}/${statementYear}`, statementYear);
    } else {
      inherited = resolveYear(inherited, statementYear);
    }
  }
  return { data: inherited, isInherited: true };
}

/** Converte DD/MM/YYYY (ou herdado do parser) para ISO yyyy-MM-dd. */
export function extratoDateToIso(data: string, statementYear?: string): string {
  const trimmed = String(data ?? '')
    .trim()
    .replace(/\s*([\/\-\.])\s*/g, '$1');
  if (isExtratoDatePlaceholder(trimmed)) return '';
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const year = statementYear?.trim() || String(new Date().getFullYear());
  const resolved = resolveYear(trimmed, year);
  const full = resolved.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (full) {
    return `${full[3]}-${full[2].padStart(2, '0')}-${full[1].padStart(2, '0')}`;
  }

  const ext = extractDateFromText(trimmed, year);
  if (ext) {
    let d = ext.normalized;
    if (d.split('/').length === 2) d = `${d}/${year}`;
    const resolvedExt = resolveYear(d, year);
    const fullExt = resolvedExt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (fullExt) {
      return `${fullExt[3]}-${fullExt[2].padStart(2, '0')}-${fullExt[1].padStart(2, '0')}`;
    }
  }

  const loose = trimmed.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (loose) {
    const idx = loose.index ?? 0;
    const before = trimmed.slice(Math.max(0, idx - 2), idx);
    const insideTedCode = /\d\.$/.test(before) && /^\d{3}\./.test(trimmed.slice(Math.max(0, idx - 3)));
    if (!insideTedCode) {
      const dd = loose[1]!.padStart(2, '0');
      const mm = loose[2]!.padStart(2, '0');
      const dVal = parseInt(dd, 10);
      const mVal = parseInt(mm, 10);
      if (dVal >= 1 && dVal <= 31 && mVal >= 1 && mVal <= 12) {
        const yp = loose[3]
          ? loose[3].length === 2
            ? `20${loose[3]}`
            : loose[3]
          : year;
        return `${yp}-${mm}-${dd}`;
      }
    }
  }
  return '';
}

// --- Parsing Logic ---

const extractDocumento = (text: string): string | undefined => {
  const match = text.match(/\b\d{2}\.\d{3}\.\d{3}[\s/]\d{4}-\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{14}\b|\b\d{10,13}\b/);
  return match ? match[0] : undefined;
};

const cleanHistoricoString = (s: string) => {
  return sanitizeHistory(s);
};

const buildCleanHistorico = (rawText: string, valStr: string, date: string, allMoneyGlobal: RegExp): string => {
  const doc = extractDocumento(rawText);
  let cleaned = rawText
    .split(date).join('')
    .replace(allMoneyGlobal, '');
  
  if (doc) cleaned = cleaned.replace(doc, '');
  
  return cleanHistoricoString(cleaned);
};

export const parsePlainText = (text: string, inferredYear?: string, ignoreList?: string[], config?: ExtractionConfig): Transaction[] => {
  // Normalize unicode dashes and common OCR artifacts
  text = text.replace(/[−–]/g, '-');
  text = text.replace(/(\d)\.,(\d)/g, '$1.$2');
  text = text.replace(/(\d+),(\d{3}),(\d{2})\b/g, '$1.$2,$3');
  text = text.replace(/(\d)\s*\.\s*(\d{3}),(\d{2})/g, '$1.$2,$3');
  text = text.replace(/[Dd][Ee3][Bb][Ii1][Tt][Oo0]/g, 'DÉBITO');
  text = text.replace(/[Dd][Ee3][Bb][Ii1][Tt][Oo0],?/g, 'DÉBITO '); // Fix DÉB,
  text = text.replace(/[Dd][Ee3][Bb][,]/g, 'DÉBITO ');
  text = text.replace(/[Dd][Ee3][Bb]\./g, 'DÉBITO ');
  text = text.replace(/[Cc][Rr][Ee3][Dd][Ii1][Tt][Oo0]/g, 'CRÉDITO');
  text = text.replace(/\b[Ll][Oo0][Ff]\b/ig, 'IOF');
  text = text.replace(/\b[Ll][Oo0][Ff]\s+ADICIONAL\b/ig, 'IOF ADICIONAL');
  text = text.replace(/\b[Ll][Oo0][Ff]\s+DIARIO\b/ig, 'IOF DIARIO');
  
  // OCR specific normalization: fix spaces in numbers (e.g., "1 . 234 , 56" -> "1.234,56")
  text = text.replace(/(\d)\s+([.,])\s+(\d)/g, '$1$2$3');
  text = text.replace(/(\d)\s+([.,])(\d)/g, '$1$2$3');
  text = text.replace(/(\d)([.,])\s+(\d)/g, '$1$2$3');

  console.log("Parsing text (length:", text.length, "):", text.substring(0, 500) + "...");

  const lines = text.split(/\r?\n/);
  let lastValidContextDate = "";
  let statementYear = inferredYear || extractStatementYear(text);

  // Custom ignore logic - CONTAINS match (case insensitive)
  const shouldIgnore = (t: string) => {
    const trimmed = t.trim();
    if (trimmed.length === 0) return true;
    
    // Manual ignores (always active)
    if (ignoreList && ignoreList.some(w => trimmed.toLowerCase().includes(w.toLowerCase()))) return true;
    if (config?.ignoreWords && config.ignoreWords.some(w => trimmed.toLowerCase().includes(w.toLowerCase()))) return true;
    if (isBankStatementNoiseLine(trimmed)) return true;

    return false;
  };

  const skipContinuationLine = (t: string) => {
    const trimmed = t.trim();
    if (shouldIgnore(trimmed)) return true;
    // If it starts with a date pattern, it's likely a new transaction starting
    if (/^\d{1,2}[\/\.-]\d{1,2}/.test(trimmed)) return true;
    return false;
  };

  interface PendingTxt {
    id: string;
    data: string;
    historico: string;
    valor: number;
    cd: 'C' | 'D';
    isInheritedDate: boolean;
    documento?: string;
    descLines: string[];
  }

  let pending: PendingTxt | null = null;
  let preBuffer: string[] = [];
  const results: Transaction[] = [];

  const flushPendingTxt = (p: PendingTxt | null) => {
    if (!p) return;
    const extraDesc = (p.descLines || [])
      .filter(l => l && (config ? l.trim().length > 0 : l.length > 2))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const currentHist = p.historico;
    const isJunk = !currentHist || currentHist.toLowerCase() === 'lançamento' || currentHist.toLowerCase() === 'lancamento';
    
    let fullHistorico = "";
    if (!isJunk && extraDesc) {
      fullHistorico = cleanHistoricoString(`${currentHist} ${extraDesc}`);
    } else {
      fullHistorico = cleanHistoricoString((isJunk ? "" : currentHist) || extraDesc);
    }
      
    // Try to extract document from the uncleaned history + descLines
    const rawHistory = extraDesc ? `${p.historico} ${extraDesc}` : p.historico;
    const documento = p.documento || extractDocumento(rawHistory);

    const finalHist = fullHistorico;

    // Filter out transactions based on ignore list (applied to the FINAL history)
    if (ignoreList && ignoreList.length > 0) {
        const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const histNorm = normalize(finalHist);
        
        if (ignoreList.some(k => histNorm.includes(normalize(k).trim()))) {
            return; // Drop transaction
        }
    }

    results.push({
      id: p.id,
      data: p.data,
      historico: finalHist,
      valor: p.valor,
      cd: p.cd,
      isInheritedDate: p.isInheritedDate,
      documento,
    });
  };

  lines.forEach((rawText, idx) => {
    rawText = rawText.trim();
    if (!rawText || shouldIgnore(rawText)) return;

    const allMoneyMatches = Array.from(rawText.matchAll(new RegExp(moneyRegex.source, 'g')));
    let moneyMatch = null;
    if (allMoneyMatches.length > 0) {
        const withIndicator = allMoneyMatches.find(m => /[DC]$/i.test(m[1].trim()));
        if (withIndicator) {
            moneyMatch = withIndicator;
        } else {
            const withTwoDecimals = allMoneyMatches.find(m => hasTwoDecimals(m[1]));
            moneyMatch = withTwoDecimals || allMoneyMatches[0];
        }
    }
    const dateExtraction = extractDateFromText(rawText, statementYear);

    // Update context date if a valid date is found on ANY line
    if (dateExtraction && !/^00\/00/.test(dateExtraction.normalized)) {
        const idx = rawText.indexOf(dateExtraction.original);
        const prefix = rawText.substring(0, Math.max(0, idx)).toLowerCase();
        const isNoisePrefix = DATE_NOISE_PREFIX.test(prefix);
        const isHeader = rawText.length <= dateExtraction.original.length + 15;
        const isConfigMode = !!config;
        
        if (!isNoisePrefix && (isConfigMode || moneyMatch || idx <= 20 || isHeader)) {
            let finalDate = dateExtraction.normalized;
            if (finalDate.split('/').length === 2 && statementYear) {
                finalDate = `${finalDate}/${statementYear}`;
            }
            finalDate = resolveYear(finalDate, statementYear);
            lastValidContextDate = advanceDate(lastValidContextDate, finalDate);
            if (pending && config?.dateMode === 'one-per-tx') {
                flushPendingTxt(pending);
                pending = null;
            }
        }
    }

    if (shouldIgnore(rawText)) { flushPendingTxt(pending); pending = null; return; }
    
    if (moneyMatch) {
      const valStr = moneyMatch[1].trim();
      // User Request: "SINAL DE MENOS ATRAS DE UM NUMERO NAO PODE SER CONSIDERADO VALOR NEGATIVO"
      // Only consider leading minus or parenthesis as negative.
      const isNegative = /^[-−]/.test(valStr) || /^\(.*\)$/.test(valStr);
      const isPositive = /^[+]/.test(valStr) || /\s[+]/.test(valStr) || /\s[C]$/i.test(valStr) || /[C]$/i.test(valStr);
      
      let numeric = parseValue(valStr);
      if (isNaN(numeric) || numeric === 0) {
        if (pending && !skipContinuationLine(rawText)) {
            const maxExtraLines = config ? (config.historyLines - 1) : 10;
            if (pending.descLines.length < maxExtraLines) {
                if (config) {
                    pending.descLines.push(rawText);
                } else if (rawText.length > 2) {
                    pending.descLines.push(rawText);
                }
            }
        }
        return;
      }
      numeric = Math.round(Math.abs(numeric) * 100) / 100;

      flushPendingTxt(pending);
      pending = null;

      let indicator = '';
      if (/d[eé]b(ito)?/i.test(rawText)) indicator = 'D';
      else if (/cr[eé]d(ito)?/i.test(rawText)) indicator = 'C';

      if (!indicator) {
        const valEnd = rawText.indexOf(valStr) + valStr.length;
        const afterVal = rawText.slice(valEnd);
        const suffixMatch = afterVal.match(/^\s*([CD])(?:[\s|]|$)/i);
        if (suffixMatch) indicator = suffixMatch[1].toUpperCase();
      }

      if (!indicator) {
        const rowMatch = rawText.match(/\|\s*([CD])\s*(?:\||$)/i)
                      || rawText.match(/(?:^|[\s|])([CD])(?:[\s|]|$)/i);
        if (rowMatch) indicator = rowMatch[1].toUpperCase();
      }

      if (!indicator) {
        for (let j = 1; j <= 5; j++) {
          if (!lines[idx + j]) break;
          const next = lines[idx + j].trim();
          if (next.match(moneyRegex) && /\d{1,2}[\/\.]/.test(next)) break; 
          if (/^D$/i.test(next)) { indicator = 'D'; lines[idx + j] = ''; break; }
          if (/^C$/i.test(next)) { indicator = 'C'; lines[idx + j] = ''; break; }
          const trailing = next.match(/\s([DC])$/i);
          if (trailing) { indicator = trailing[1].toUpperCase(); lines[idx + j] = next.replace(/\s([DC])$/i, ''); break; }
        }
      }

      let cd: 'C' | 'D' = 'C';
      if (indicator === 'D') cd = 'D';
      else if (indicator === 'C') cd = 'C';
      else {
        const lower = rawText.toLowerCase();
        if (/pix\s*(enviad|emit|saiu|out)|ted\s*enviad|transf.*\boutro\b|d[eé]b|saída|pagament/i.test(lower)) cd = 'D';
        else if (/pix\s*(recebid|in|entrou)|ted\s*receb|cr[eé]d|entrada|recebiment/i.test(lower)) cd = 'C';
        else if (isNegative) cd = 'D';
        else if (isPositive) cd = 'C';
        else cd = 'C';
      }

      if (!lastValidContextDate && !config && !/RENDE\s+FACIL/i.test(rawText)) {
          console.log(`[parsePlainText] Skipping transaction because no date context found yet and no config active: "${rawText}"`);
          return;
      }

      const allMoneyGlobal = new RegExp(moneyRegex.source, 'g');
      let historico = config 
        ? rawText.trim() 
        : buildCleanHistorico(rawText, valStr, dateExtraction?.original || lastValidContextDate, allMoneyGlobal);
      
      if (!historico && !config) return;

      if (preBuffer.length > 0) {
        const preText = preBuffer.join(' ');
        historico = historico ? cleanHistoricoString(`${preText} ${historico}`) : cleanHistoricoString(preText);
        preBuffer = [];
      }
      
      const documento = extractDocumento(rawText);
      const { data: txDate, isInherited } = resolveTransactionDate(
        dateExtraction,
        '',
        lastValidContextDate,
        statementYear,
      );
      if (!txDate && !config) return;
      if (!isInherited && txDate) {
        lastValidContextDate = advanceDate(lastValidContextDate, txDate);
      }

      pending = {
        id: `txt-${idx}`,
        data: txDate,
        historico: historico || "",
        valor: numeric,
        cd,
        isInheritedDate: isInherited,
        documento,
        descLines: [],
      };
    } else {
      if (pending && rawText.length > 0 && !skipContinuationLine(rawText)) {
        // In smart mode, we ignore the historyLines setting and use a high limit (20)
        // because the system "knows what to do" based on gaps and date detection.
        const maxExtraLines = (config?.historyMode === 'smart') ? 20 : (config ? (config.historyLines - 1) : 10);
        
        if (pending.descLines.length < maxExtraLines) {
            if (config) {
                pending.descLines.push(rawText);
            } else if (rawText.length > 2) {
                pending.descLines.push(rawText);
            }
        }
      } else if (rawText.length > 2 && !shouldIgnore(rawText)) {
        preBuffer.push(rawText);
        if (preBuffer.length > 10) preBuffer.shift();
      }
    }
  });

  flushPendingTxt(pending);
  return propagateTransactionDates(results);
};

export const extractLinesFromPDF = async (
  file: File,
  inferredYear?: string,
  setProcessingMsg?: (msg: string) => void,
  ignoreList?: string[],
  config?: ExtractionConfig,
): Promise<ScannedLine[]> => {
  void file;
  void inferredYear;
  void setProcessingMsg;
  void ignoreList;
  void config;
  throw new Error(
    'Extração de extrato por parser de texto PDF foi desativada. Use OCR scanner (PDF → imagem → DocTR) no painel de colunas.',
  );
};

