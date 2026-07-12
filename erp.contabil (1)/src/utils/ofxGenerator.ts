/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Transaction, BankConfig } from "../types";

/**
 * Formats a YYYY-MM-DD date string into OFX format YYYYMMDD000000
 */
function formatOfxDate(dateStr: string): string {
  if (!dateStr) return "";
  // Remove hyphens if present
  const clean = dateStr.replace(/-/g, "");
  if (clean.length === 8) {
    return `${clean}120000[-3:BRT]`; // Standard Brazilian timezone offset as default
  }
  return clean;
}

/**
 * Generates an OFX string based on transactions and bank configuration
 */
export function generateOFX(transactions: Transaction[], config: BankConfig): string {
  const nowStr = new Date().toISOString().replace(/[-T:]/g, "").substring(0, 14);
  
  // Sort transactions by date ascending
  const sortedTrans = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  
  const dtStart = sortedTrans.length > 0 ? formatOfxDate(sortedTrans[0].date) : nowStr;
  const dtEnd = sortedTrans.length > 0 ? formatOfxDate(sortedTrans[sortedTrans.length - 1].date) : nowStr;

  // Header SGML
  let ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
      <DTSERVER>${nowStr}</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>1</TRNUID>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
      <STMTRS>
        <CURDEF>${config.currency || "BRL"}</CURDEF>
        <BANKACCTFROM>
          <BANKID>${config.bankId || "000"}</BANKID>
          <ACCTID>${config.accountId || "00000-0"}</ACCTID>
          <ACCTTYPE>${config.accountType || "CHECKING"}</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${dtStart}</DTSTART>
          <DTEND>${dtEnd}</DTEND>
`;

  // Write statement transactions
  sortedTrans.forEach((t, index) => {
    const uniqueId = t.id || `${formatOfxDate(t.date)}${index + 1}`;
    const ofxDate = formatOfxDate(t.date);
    // Amount must be formatted with '.' decimal separator and no thousands separator
    const ofxAmount = t.amount.toFixed(2);
    // Clean memo from characters that could break OFX XML parsing
    const cleanMemo = t.description
      .replace(/[<&>]/g, "")
      .substring(0, 80)
      .toUpperCase();

    ofx += `          <STMTTRN>
            <TRNTYPE>${t.type === "DEBIT" ? "DEBIT" : "CREDIT"}</TRNTYPE>
            <DTPOSTED>${ofxDate}</DTPOSTED>
            <TRNAMT>${ofxAmount}</TRNAMT>
            <FITID>${uniqueId}</FITID>
            <MEMO>${cleanMemo}</MEMO>
          </STMTTRN>\n`;
  });

  // Closing tags
  ofx += `        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>0.00</BALAMT>
          <DTASOF>${nowStr}</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

  return ofx;
}

/**
 * Triggers a download of a generated OFX file in the browser
 */
export function downloadOFXFile(transactions: Transaction[], config: BankConfig, originalFileName?: string) {
  const ofxContent = generateOFX(transactions, config);
  const blob = new Blob([ofxContent], { type: "application/x-ofx;charset=utf-8" });
  
  // Create filename
  let filename = "extrato_convertido.ofx";
  if (originalFileName) {
    const baseName = originalFileName.substring(0, originalFileName.lastIndexOf(".")) || originalFileName;
    filename = `${baseName}_ofx.ofx`;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
