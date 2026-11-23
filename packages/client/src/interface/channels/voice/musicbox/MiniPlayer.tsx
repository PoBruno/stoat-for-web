import { Show } from "solid-js";

import { styled } from "styled-system/jsx";

import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { ControlesDaMusica } from "./Controles";
import { usarMusicBox } from "./loja";

/**
 * O player da musica, na barra de baixo da chamada.
 *
 * Aparece so quando ha algo na vez. Antes os controles moravam dentro do
 * painel do MusicBox, entao pausar ou pular exigia abrir o painel e tirar a
 * chamada da tela. Na barra eles ficam a mao como num player de Spotify, com
 * as pessoas (ou a tela compartilhada) a vista.
 *
 * Clicar na capa ou no titulo abre o painel, onde estao a fila e a busca.
 */
export function MiniPlayer(props: {
  channelId: string;
  /** Abre o painel do MusicBox */
  onAbrir: () => void;
}) {
  // O canal e fixo por instancia: quem troca de canal remonta (<Show keyed>).
  // eslint-disable-next-line solid/reactivity
  const mb = usarMusicBox(props.channelId);
  const atual = () => mb.estado().current;

  /** Pedida, mas o som ainda nao saiu: nao mostra progresso de mentira. */
  const carregando = () => mb.estado().playing && !!mb.estado().loading;

  const progresso = () => {
    const duracao = atual()?.duration_s ?? 0;
    return duracao > 0
      ? Math.min(100, (mb.estado().position_s / duracao) * 100)
      : 0;
  };

  return (
    <Show when={atual()}>
      {(faixa) => (
        <Caixa aria-label="Música tocando na chamada">
          <Abrir
            type="button"
            onClick={() => props.onAbrir()}
            aria-label="Abrir o MusicBox"
            use:floating={{
              tooltip: {
                placement: "top",
                content: `${faixa().title}${faixa().author ? ` — ${faixa().author}` : ""}`,
              },
            }}
          >
            <Capa data-pausado={mb.estado().playing ? undefined : "1"}>
              <Show
                when={faixa().cover_url}
                fallback={<Symbol size={18}>music_note</Symbol>}
              >
                {(capa) => <img src={capa()} alt="" />}
              </Show>
              <Show when={carregando()}>
                <Carregando aria-label="Carregando a música">
                  <span />
                </Carregando>
              </Show>
            </Capa>
            <Textos>
              <span>{faixa().title}</span>
              <Barra data-carregando={carregando() ? "" : undefined}>
                <div
                  style={{ width: `${carregando() ? 100 : progresso()}%` }}
                />
              </Barra>
            </Textos>
          </Abrir>

          <ControlesDaMusica mb={mb} />

          {/* Com o painel fechado, a falha de um botao daqui nao teria onde
              aparecer: pareceria que o clique nao fez nada. */}
          <Show when={mb.erro()}>
            {(texto) => (
              <Erro
                role="alert"
                use:floating={{
                  tooltip: { placement: "top", content: texto() },
                }}
              >
                <Symbol size={18}>error</Symbol>
              </Erro>
            )}
          </Show>
        </Caixa>
      )}
    </Show>
  );
}

/**
 * Mede a si mesma (`containerType`) e nao a janela: a largura que sobra na
 * barra depende da lista de membros, do tamanho da janela e do texto de
 * status. Faltando espaco, sai primeiro o titulo, depois aleatorio e
 * repeticao (Controles.tsx).
 */
const Caixa = styled("div", {
  base: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    minWidth: 0,
    containerType: "inline-size",
  },
});

const Abrir = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    flexShrink: 0,
    padding: "2px",
    paddingRight: "var(--gap-sm)",
    border: "none",
    borderRadius: "var(--borderRadius-md)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    cursor: "pointer",
    textAlign: "start",

    _hover: { background: "var(--md-sys-color-surface-container-high)" },
  },
});

const Capa = styled("div", {
  base: {
    width: "36px",
    height: "36px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-sm)",
    background: "var(--md-sys-color-surface-container-highest)",
    transition: "opacity .2s",

    position: "relative",

    "& img": { width: "100%", height: "100%", objectFit: "cover" },
    "&[data-pausado]": { opacity: 0.5 },
  },
});

/** Roda girando por cima da capa enquanto a musica carrega. */
const Carregando = styled("div", {
  base: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    background: "rgba(0, 0, 0, 0.55)",
    color: "white",

    "& span": {
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      border: "2px solid currentColor",
      borderTopColor: "transparent",
      animation: "spin 0.8s linear infinite",
    },
  },
});

/**
 * Titulo cortado com reticencias. Some quando a barra aperta: os botoes
 * importam mais que o nome, que continua na dica da capa.
 */
const Textos = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
    width: "140px",
    fontSize: "12px",
    fontWeight: 600,

    "& > span": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },

    "@container (max-width: 360px)": { display: "none" },
  },
});

const Barra = styled("div", {
  base: {
    height: "3px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",
    overflow: "hidden",

    "& > div": {
      height: "100%",
      background: "var(--md-sys-color-primary)",
      transition: "width 2s linear",
    },

    "&[data-carregando] > div": {
      opacity: 0.35,
      transition: "none",
      animation: "pulse 1.4s ease-in-out infinite",
    },
  },
});

const Erro = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    color: "var(--md-sys-color-error)",
  },
});
