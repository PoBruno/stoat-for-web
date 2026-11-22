import { type JSX, Show, createSignal, onCleanup } from "solid-js";

import { styled } from "styled-system/jsx";

import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import type { ClienteMusicBox } from "./estado";

/**
 * Aleatorio, parar, tocar/pausar, proxima e repeticao.
 *
 * Moram na barra da chamada (MiniPlayer), e nao no painel: assim o player
 * fica a mao com o painel fechado, e o painel usa a altura inteira para a
 * busca e a fila.
 */
export function ControlesDaMusica(props: { mb: ClienteMusicBox }) {
  const confirmarParar = useConfirmacao();
  const estado = () => props.mb.estado();

  function girarRepeticao() {
    const agora = estado().repeat;
    void props.mb.ajustar({
      repeat: agora === "off" ? "all" : agora === "all" ? "one" : "off",
    });
  }

  const rotuloRepeticao = () =>
    estado().repeat === "off"
      ? "Repetição desligada"
      : estado().repeat === "all"
        ? "Repetindo a fila"
        : "Repetindo a faixa";

  return (
    <Linha>
      <Opcional>
        <IconButton
          size="sm"
          onPress={() => void props.mb.ajustar({ shuffle: !estado().shuffle })}
          variant={estado().shuffle ? "tonal" : "standard"}
          aria-label="Ordem aleatória"
          use:floating={{
            tooltip: {
              placement: "top",
              content: estado().shuffle
                ? "Ordem aleatória ligada"
                : "Ordem aleatória",
            },
          }}
        >
          <Symbol>shuffle</Symbol>
        </IconButton>
      </Opcional>

      <IconButton
        size="sm"
        // A fila e de todos no canal: parar e limpar pede um segundo
        // clique, com o botao em vermelho avisando.
        // eslint-disable-next-line solid/reactivity -- a acao roda no clique
        onPress={() => confirmarParar.pedir(() => void props.mb.parar())}
        isDisabled={!estado().current}
        variant={confirmarParar.armado() ? "tonal" : "standard"}
        aria-label={
          confirmarParar.armado()
            ? "Clique de novo para parar e limpar a fila de todos"
            : "Parar e limpar a fila"
        }
        use:floating={{
          tooltip: {
            placement: "top",
            content: confirmarParar.armado()
              ? "Clique de novo para confirmar"
              : "Parar e limpar a fila",
          },
        }}
      >
        <Symbol
          style={
            confirmarParar.armado()
              ? { color: "var(--md-sys-color-error)" }
              : undefined
          }
        >
          stop
        </Symbol>
      </IconButton>

      <BotaoTocar
        onPress={() => void props.mb.alternar()}
        isDisabled={!estado().current}
        aria-label={estado().playing ? "Pausar" : "Tocar"}
      >
        <Show when={estado().playing} fallback={<Symbol>play_arrow</Symbol>}>
          <Symbol>pause</Symbol>
        </Show>
      </BotaoTocar>

      <IconButton
        size="sm"
        onPress={() => void props.mb.proxima()}
        isDisabled={!estado().queue.length}
        aria-label="Próxima"
        use:floating={{ tooltip: { placement: "top", content: "Próxima" } }}
      >
        <Symbol>skip_next</Symbol>
      </IconButton>

      <Opcional>
        <IconButton
          size="sm"
          onPress={girarRepeticao}
          variant={estado().repeat === "off" ? "standard" : "tonal"}
          aria-label={rotuloRepeticao()}
          use:floating={{
            tooltip: { placement: "top", content: rotuloRepeticao() },
          }}
        >
          <Show
            when={estado().repeat === "one"}
            fallback={<Symbol>repeat</Symbol>}
          >
            <Symbol>repeat_one</Symbol>
          </Show>
        </IconButton>
      </Opcional>
    </Linha>
  );
}

/**
 * Botao de tocar, em destaque.
 *
 * Nao usa `styled(IconButton)`: aquilo resolve o componente na hora em que o
 * modulo carrega, e este modulo e alcancado a partir da propria biblioteca de
 * UI — o resultado era tela em branco com um erro que nomeia o botao, nao o
 * ciclo. Um recipiente que estiliza por dentro adia isso para a renderizacao.
 */
function BotaoTocar(props: {
  onPress: () => void;
  isDisabled?: boolean;
  "aria-label"?: string;
  children: JSX.Element;
}) {
  return (
    <Destaque>
      <IconButton
        size="sm"
        onPress={props.onPress}
        isDisabled={props.isDisabled}
        aria-label={props["aria-label"]}
      >
        {props.children}
      </IconButton>
    </Destaque>
  );
}

/**
 * Confirmacao em dois cliques: o primeiro arma por 3 s, o segundo executa.
 *
 * Para acoes que mexem no que e de todos (a fila do canal) e nao tem
 * desfazer. Um modal seria pesado demais para um botao de player.
 */
export function useConfirmacao() {
  const [armado, setArmado] = createSignal(false);
  let prazo: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(prazo));

  return {
    armado,
    pedir(acao: () => void) {
      clearTimeout(prazo);
      if (armado()) {
        setArmado(false);
        acao();
        return;
      }
      setArmado(true);
      prazo = setTimeout(() => setArmado(false), 3000);
    },
  };
}

const Linha = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    flexShrink: 0,
  },
});

/** Aleatorio e repeticao: os primeiros a sair quando a barra aperta. */
const Opcional = styled("span", {
  base: {
    display: "contents",
    "@container (max-width: 250px)": { display: "none" },
  },
});

/**
 * Tonal, e nao preenchido com a cor principal: na barra da chamada, mudo e
 * fone ja sao circulos preenchidos, e um terceiro igual ao lado parecia
 * controle da chamada.
 */
const Destaque = styled("div", {
  base: {
    display: "contents",
    "& button": {
      background: "var(--md-sys-color-secondary-container)",
      color: "var(--md-sys-color-on-secondary-container)",
    },
    "& button:hover": {
      background: "var(--md-sys-color-secondary-container)",
    },

    // O ícone precisa ser dito explicitamente, senão não acompanha.
    //
    // Uma regra geral pinta todo `svg` com a cor de frente da superfície, e
    // ela vence a herança do `color` acima. Num botão preenchido com a cor de
    // destaque isso deixava um ícone claro sobre fundo claro — o botão de
    // tocar sumia, e era justamente o único que precisava ser achado de
    // primeira.
    "& button svg": {
      fill: "currentColor",
    },
  },
});
