import { SelectedTheme } from "@revolt/state/stores/Theme";

/**
 * Generate Stoat for Web variables
 * @param theme Theme
 * @returns CSS Variables
 */
export function createStoatWebVariables(theme: SelectedTheme) {
  return {
    // helper variables
    "--unset-fg": "red",
    "--unset-bg": "linear-gradient(to right, red, blue)",

    // message size
    "--message-size": `${theme.messageSize}px`,
    "--message-group-spacing": `${theme.messageGroupSpacing}px`,

    // emoji size
    "--emoji-size": "1.4em",
    "--emoji-size-medium": "48px",
    "--emoji-size-large": "96px",

    // effects
    "--effects-blur-md": theme.blur ? "blur(20px)" : "unset",
    "--effects-invert-black": theme.darkMode ? "invert(100%)" : "invert(0%)",
    "--effects-invert-light": theme.darkMode ? "invert(0%)" : "invert(1000%)",

    // transitions
    "--transitions-fast": ".1s ease-in-out",
    "--transitions-medium": ".2s ease",

    // brand
    "--brand-presence-online": "#3ABF7E",
    "--brand-presence-idle": "#F39F00",
    "--brand-presence-busy": "#F84848",
    "--brand-presence-focus": "#4799F0",
    "--brand-presence-invisible": "#A5A5A5",

    // font
    "--fonts-primary": `"${theme.interfaceFont}", "Inter", sans-serif`,
    "--fonts-monospace": `"${theme.monospaceFont}", "Jetbrains Mono", sans-serif`,

    // load constants
    ...reduceWithPrefix(escalaDeCantos(theme.cornerRadius), "--borderRadius-"),
    ...reduceWithPrefix(themeConstants.gap, "--gap-"),
    ...reduceWithPrefix(themeConstants.layout, "--layout-"),

    // Faixa entre a barra lateral e o painel de conteúdo.
    //
    // Tem variável própria em vez de reusar `--gap-md`: aquele token é usado
    // em dezenas de lugares sem relação com este espaço, e mexer nele para
    // ajustar a faixa mudaria respiro de coisas que ninguém pediu.
    "--layout-panel-spacing": `${theme.panelSpacing}px`,
  };
}

/**
 * Escala de arredondamento derivada de um único valor
 *
 * O Material 3 define dez degraus proporcionais entre si. Mudar apenas um
 * deles quebraria a relação; mudar todos à mão seria dez ajustes para uma
 * decisão só. Aqui o valor escolhido é a régua — o degrau `xl`, que é o do
 * painel principal — e os outros acompanham na mesma proporção.
 *
 * `none`, `full` e `circle` ficam de fora de propósito: um botão em forma de
 * pílula e um avatar redondo não são decisões de estilo, são a forma da
 * coisa.
 */
function escalaDeCantos(maximo: number) {
  // Os degraus do Material 3 Expressive, que definem as proporções.
  // https://m3.material.io/styles/shape/corner-radius-scale
  const referencia = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    li: 20,
    xl: 28,
    xli: 32,
    xxl: 48,
  };

  const fator = maximo / referencia.xl;

  const escalado = Object.fromEntries(
    Object.entries(referencia).map(([degrau, valor]) => [
      degrau,
      // Arredonda para o pixel: meio pixel em borda rende serrilhado.
      `${Math.round(valor * fator)}px`,
    ]),
  );

  return {
    none: "0px",
    ...escalado,
    full: "calc(infinity * 1px)",
    circle: "100%",
  };
}

/**
 * Add prefix to all keys in an object
 * @param object Object
 * @param prefix Prefix
 * @returns New object
 */
function reduceWithPrefix(object: Record<string, string>, prefix: string) {
  return Object.entries(object).reduce(
    (d, [k, v]) => ({ ...d, [`${prefix}${k}`]: v }),
    {},
  );
}

const themeConstants = {
  /**
   * @deprecated decide this at a component level
   */
  gap: {
    none: "0",
    xxs: "1px",
    xs: "2px",
    s: "6px",
    sm: "4px",
    md: "8px",
    l: "12px",
    lg: "15px",
    x: "28px",
    xl: "32px",
    xxl: "64px",
  },
  layout: {
    "width-channel-sidebar": "248px",
    "width-user-context-menu-truncate": "300px",
    "height-message-box": "32vh",
  },
};
