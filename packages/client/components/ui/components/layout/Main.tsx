import { cva } from "styled-system/css";

/**
 * Styles for the main content of a page
 *
 * This creates a surface on the lowest level with appropriate padding and separation.
 */
export const main = cva({
  base: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,

    display: "flex",
    overflow: "hidden",
    flexDirection: "column",

    paddingInline: "var(--gap-md)",
    // A margem é a faixa visível entre a barra lateral e este painel, e é
    // ajustável em Aparência. O `padding` acima continua no token comum:
    // ele é respiro interno do texto, não a divisão entre os dois.
    marginInline: "var(--layout-panel-spacing)",
    marginBlockEnd: "var(--layout-panel-spacing)",
    borderRadius: "var(--borderRadius-xl)",
    background: "var(--md-sys-color-surface-container-lowest)",
    paddingBottom: "env(keyboard-inset-height)",

    _tablet: {
      margin: 0,
      borderBottomRightRadius: 0,
      borderBottomLeftRadius: 0,
    },

    _phone: {
      margin: 0,
      borderRadius: 0,
    },
  },
});
