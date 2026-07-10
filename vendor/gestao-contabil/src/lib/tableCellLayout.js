/**
 * Largura máxima equivalente a ~36× "X" (unidade ch) antes de permitir quebra de linha.
 * Colunas crescem com o conteúdo até este limite; texto maior quebra em linhas seguintes.
 */
export const TABLE_CELL_MAX_WIDTH_CH = 36;

/** Classes Tailwind aplicadas em TableHead/TableCell por defeito em todo o app */
export const tableCellWrapClasses =
  "align-top max-w-[36ch] whitespace-normal break-words [overflow-wrap:anywhere] [word-break:normal]";
