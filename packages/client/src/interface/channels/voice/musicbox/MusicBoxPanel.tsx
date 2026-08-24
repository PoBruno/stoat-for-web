import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";

import { styled } from "styled-system/jsx";

import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";
import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdDrag from "@material-design-icons/svg/outlined/drag_indicator.svg?component-solid";
import MdMusic from "@material-design-icons/svg/outlined/music_note.svg?component-solid";
import MdPause from "@material-design-icons/svg/outlined/pause.svg?component-solid";
import MdPlay from "@material-design-icons/svg/outlined/play_arrow.svg?component-solid";
import MdRepeat from "@material-design-icons/svg/outlined/repeat.svg?component-solid";
import MdRepeatOne from "@material-design-icons/svg/outlined/repeat_one.svg?component-solid";
import MdSearch from "@material-design-icons/svg/outlined/search.svg?component-solid";
import MdShuffle from "@material-design-icons/svg/outlined/shuffle.svg?component-solid";
import MdNext from "@material-design-icons/svg/outlined/skip_next.svg?component-solid";
import MdPrevious from "@material-design-icons/svg/outlined/skip_previous.svg?component-solid";
import MdVolumeOff from "@material-design-icons/svg/outlined/volume_off.svg?component-solid";
import MdVolumeUp from "@material-design-icons/svg/outlined/volume_up.svg?component-solid";

import { Button, IconButton, Row, Slider, Text } from "@revolt/ui";

import {
  type Faixa,
  acoes,
  duracaoDaFila,
  duracaoLegivel,
  estado,
  povoarParaDesenvolvimento,
} from "./estado";

type Aba = "fila" | "buscar";

/**
 * Painel do MusicBox, mostrado durante a chamada.
 *
 * Ocupa a altura inteira da area da chamada, ao contrario do soundboard: uma
 * fila de musica e uma lista que a pessoa fica olhando e reordenando, nao um
 * punhado de botoes para apertar de relance.
 */
export function MusicBoxPanel(props: { onClose: () => void }) {
  const [aba, setAba] = createSignal<Aba>("fila");

  onMount(povoarParaDesenvolvimento);

  return (
    <Painel>
      <Cabecalho>
        <Row align gap="sm">
          <MdMusic />
          <Text class="title">MusicBox</Text>
        </Row>
        <IconButton onPress={props.onClose} aria-label="Fechar o MusicBox">
          <MdClose />
        </IconButton>
      </Cabecalho>

      <Show when={!estado.disponivel}>
        <Aviso>
          <Text class="label">
            Nenhum agente conectado — a fila pode ser montada, mas nada toca
            ainda.
          </Text>
        </Aviso>
      </Show>

      <AgoraTocando />

      <Abas>
        <BotaoAba
          aria-selected={aba() === "fila"}
          data-ativa={aba() === "fila"}
          onClick={() => setAba("fila")}
        >
          Fila
          <Show when={estado.fila.length}>
            <Contagem>{estado.fila.length}</Contagem>
          </Show>
        </BotaoAba>
        <BotaoAba
          aria-selected={aba() === "buscar"}
          data-ativa={aba() === "buscar"}
          onClick={() => setAba("buscar")}
        >
          Buscar
        </BotaoAba>
      </Abas>

      <Corpo>
        <Switch>
          <Match when={aba() === "fila"}>
            <Fila />
          </Match>
          <Match when={aba() === "buscar"}>
            <Busca />
          </Match>
        </Switch>
      </Corpo>
    </Painel>
  );
}

/** Capa, titulo, progresso e controles da faixa atual. */
function AgoraTocando() {
  const semFaixa = () => !estado.atual;

  return (
    <Topo>
      <Row gap="md" align>
        <Capa>
          <Show
            when={estado.atual?.capa}
            fallback={<MdMusic style={{ opacity: 0.4 }} />}
          >
            {(capa) => <img src={capa()} alt="" />}
          </Show>
        </Capa>

        <Identificacao>
          <TituloAtual>
            <Text class="body">{estado.atual?.titulo ?? "Nada tocando"}</Text>
          </TituloAtual>
          <Text class="label">
            {estado.atual?.autor ?? "Adicione algo pela aba Buscar"}
          </Text>
        </Identificacao>
      </Row>

      <Progresso>
        <Slider
          min={0}
          max={Math.max(1, estado.atual?.duracao ?? 1)}
          value={estado.posicao}
          labelFormatter={duracaoLegivel}
          onChange={(e) => {
            // Sem faixa, ou numa transmissao ao vivo, nao ha para onde
            // pular: o deslizante existe so como indicador.
            if (!estado.atual?.duracao) return;
            acoes.definirPosicao(e.currentTarget.value);
          }}
        />
        <LinhaDeTempo>
          <Text class="label">{duracaoLegivel(estado.posicao)}</Text>
          <Text class="label">
            {estado.atual ? duracaoLegivel(estado.atual.duracao) : "--:--"}
          </Text>
        </LinhaDeTempo>
      </Progresso>

      <Controles>
        <IconButton
          onPress={acoes.alternarAleatorio}
          variant={estado.aleatorio ? "tonal" : "standard"}
          aria-label="Ordem aleatoria"
        >
          <MdShuffle />
        </IconButton>

        <IconButton
          onPress={acoes.anterior}
          isDisabled={semFaixa()}
          aria-label="Voltar ao inicio"
        >
          <MdPrevious />
        </IconButton>

        <BotaoTocar
          onPress={acoes.tocarOuPausar}
          isDisabled={semFaixa()}
          aria-label={estado.tocando ? "Pausar" : "Tocar"}
        >
          <Show when={estado.tocando} fallback={<MdPlay />}>
            <MdPause />
          </Show>
        </BotaoTocar>

        <IconButton
          onPress={acoes.proxima}
          isDisabled={!estado.fila.length}
          aria-label="Proxima"
        >
          <MdNext />
        </IconButton>

        <IconButton
          onPress={acoes.alternarRepeticao}
          variant={estado.repetir === "nao" ? "standard" : "tonal"}
          aria-label={`Repeticao: ${estado.repetir}`}
        >
          <Show when={estado.repetir === "uma"} fallback={<MdRepeat />}>
            <MdRepeatOne />
          </Show>
        </IconButton>
      </Controles>

      <Volume>
        <IconButton
          onPress={() => acoes.definirVolume(estado.volume > 0 ? 0 : 0.8)}
          aria-label={estado.volume > 0 ? "Silenciar" : "Tirar do mudo"}
        >
          <Show when={estado.volume > 0} fallback={<MdVolumeOff />}>
            <MdVolumeUp />
          </Show>
        </IconButton>
        <Slider
          min={0}
          max={100}
          value={Math.round(estado.volume * 100)}
          labelFormatter={(v) => `${v}%`}
          onChange={(e) => acoes.definirVolume(e.currentTarget.value / 100)}
        />
      </Volume>
    </Topo>
  );
}

/** Lista da fila, reordenavel arrastando. */
function Fila() {
  const [arrastando, setArrastando] = createSignal<number>();

  return (
    <Show
      when={estado.fila.length}
      fallback={
        <Vazio>
          <Text class="label">A fila esta vazia.</Text>
        </Vazio>
      }
    >
      <ResumoDaFila>
        <Text class="label">
          {estado.fila.length}{" "}
          {estado.fila.length === 1 ? "faixa" : "faixas"} —{" "}
          {duracaoLegivel(duracaoDaFila())} restantes
        </Text>
        <Button variant="text" onPress={acoes.limparFila}>
          Limpar
        </Button>
      </ResumoDaFila>

      <For each={estado.fila}>
        {(faixa, indice) => (
          <ItemDaFila
            draggable={true}
            data-arrastando={arrastando() === indice()}
            onDragStart={() => setArrastando(indice())}
            onDragEnd={() => setArrastando(undefined)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => {
              const de = arrastando();
              if (de !== undefined) acoes.mover(de, indice());
              setArrastando(undefined);
            }}
          >
            <Alca>
              <MdDrag />
            </Alca>

            <Posicao>
              <Text class="label">{indice() + 1}</Text>
            </Posicao>

            <MiniCapa>
              <Show
                when={faixa.capa}
                fallback={<MdMusic style={{ opacity: 0.4 }} />}
              >
                {(capa) => <img src={capa()} alt="" />}
              </Show>
            </MiniCapa>

            <Identificacao onClick={() => acoes.tocarAgora(indice())}>
              <Text class="body">{faixa.titulo}</Text>
              <Text class="label">{faixa.autor}</Text>
            </Identificacao>

            <Text class="label">{duracaoLegivel(faixa.duracao)}</Text>

            <IconButton
              onPress={() => acoes.remover(indice())}
              aria-label="Tirar da fila"
            >
              <MdDelete />
            </IconButton>
          </ItemDaFila>
        )}
      </For>
    </Show>
  );
}

/** Campo de busca e resultados. */
function Busca() {
  const [termo, setTermo] = createSignal("");
  const [resultados, setResultados] = createSignal<Faixa[]>([]);
  const [erro, setErro] = createSignal<string>();
  const [buscando, setBuscando] = createSignal(false);

  async function enviar(e: Event) {
    e.preventDefault();
    if (!termo().trim()) return;

    setBuscando(true);
    setErro(undefined);
    try {
      setResultados(await buscarFaixas(termo()));
    } catch {
      setResultados([]);
      setErro(
        "A busca depende de um agente conectado, e ainda nao ha rota no servidor para falar com ele.",
      );
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <FormaDeBusca onSubmit={enviar}>
        <CampoDeBusca
          value={termo()}
          placeholder="Nome da musica, artista ou link"
          onInput={(e: InputEvent) =>
            setTermo((e.currentTarget as HTMLInputElement).value)
          }
        />
        <IconButton type="submit" aria-label="Buscar">
          <MdSearch />
        </IconButton>
      </FormaDeBusca>

      <Show when={erro()}>
        {(mensagem) => (
          <Vazio>
            <Text class="label">{mensagem()}</Text>
          </Vazio>
        )}
      </Show>

      <Show when={buscando()}>
        <Vazio>
          <Text class="label">Buscando…</Text>
        </Vazio>
      </Show>

      <For each={resultados()}>
        {(faixa) => (
          <ItemDaFila>
            <MiniCapa>
              <Show
                when={faixa.capa}
                fallback={<MdMusic style={{ opacity: 0.4 }} />}
              >
                {(capa) => <img src={capa()} alt="" />}
              </Show>
            </MiniCapa>
            <Identificacao>
              <Text class="body">{faixa.titulo}</Text>
              <Text class="label">{faixa.autor}</Text>
            </Identificacao>
            <Text class="label">{duracaoLegivel(faixa.duracao)}</Text>
            <Button variant="tonal" onPress={() => acoes.adicionar(faixa)}>
              Adicionar
            </Button>
          </ItemDaFila>
        )}
      </For>
    </>
  );
}

/**
 * Costura da busca com o servidor.
 *
 * Falha de proposito enquanto a rota nao existe: devolver resultados
 * inventados aqui faria a tela parecer pronta e esconderia exatamente a peca
 * que falta.
 */
async function buscarFaixas(_termo: string): Promise<Faixa[]> {
  throw new Error("sem agente");
}

const Painel = styled("div", {
  base: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: "var(--md-sys-color-surface-container-low)",
    borderRadius: "var(--borderRadius-lg)",
    overflow: "hidden",
  },
});

const Cabecalho = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--gap-md)",
    flexShrink: 0,
  },
});

const Aviso = styled("div", {
  base: {
    margin: "0 var(--gap-md) var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-highest)",
    flexShrink: 0,
  },
});

const Topo = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "0 var(--gap-md) var(--gap-md)",
    flexShrink: 0,
  },
});

const Capa = styled("div", {
  base: {
    width: "64px",
    height: "64px",
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container-highest)",
    overflow: "hidden",
    "& img": { width: "100%", height: "100%", objectFit: "cover" },
  },
});

const MiniCapa = styled(Capa, {
  base: { width: "36px", height: "36px" },
});

/**
 * `minWidth: 0` e o que permite o corte com reticencias: sem isso um item de
 * flex nunca encolhe abaixo do proprio conteudo, e titulos longos empurram a
 * duracao e o botao para fora do painel.
 */
const Identificacao = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flexGrow: 1,
    "& > *": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  },
});

const Progresso = styled("div", {
  base: { display: "flex", flexDirection: "column" },
});

const TituloAtual = styled("div", {
  base: { fontWeight: 600 },
});

const LinhaDeTempo = styled("div", {
  base: { display: "flex", justifyContent: "space-between" },
});

const Controles = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--gap-sm)",
  },
});

const BotaoTocar = styled(IconButton, {
  base: {
    background: "var(--md-sys-color-primary)",
    color: "var(--md-sys-color-on-primary)",
    "&:hover": { background: "var(--md-sys-color-primary)" },
  },
});

const Volume = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    "& mdui-slider": { flexGrow: 1 },
  },
});

const Abas = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-sm)",
    padding: "0 var(--gap-md)",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
    flexShrink: 0,
  },
});

const BotaoAba = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm) var(--gap-md)",
    border: "none",
    background: "transparent",
    color: "var(--md-sys-color-on-surface-variant)",
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    "&[data-ativa='true']": {
      color: "var(--md-sys-color-primary)",
      borderBottomColor: "var(--md-sys-color-primary)",
    },
  },
});

const Contagem = styled("span", {
  base: {
    fontSize: "0.75rem",
    padding: "0 6px",
    borderRadius: "999px",
    background: "var(--md-sys-color-surface-container-highest)",
  },
});

/**
 * A parte que rola. `minHeight: 0` de novo pela mesma razao: sem isso o filho
 * de flex cresce com o conteudo e a rolagem vai parar no painel inteiro,
 * levando junto os controles que deveriam ficar fixos.
 */
const Corpo = styled("div", {
  base: {
    flexGrow: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "var(--gap-sm) var(--gap-md) var(--gap-md)",
  },
});

const ResumoDaFila = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "var(--gap-sm)",
  },
});

const ItemDaFila = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    padding: "var(--gap-sm)",
    borderRadius: "var(--borderRadius-md)",
    "&:hover": { background: "var(--md-sys-color-surface-container)" },
    "&[data-arrastando='true']": { opacity: 0.4 },
  },
});

const Alca = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    cursor: "grab",
    color: "var(--md-sys-color-on-surface-variant)",
    flexShrink: 0,
  },
});

const Posicao = styled("div", {
  base: { width: "1.5rem", textAlign: "center", flexShrink: 0 },
});

const Vazio = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    padding: "var(--gap-lg)",
    textAlign: "center",
  },
});

const FormaDeBusca = styled("form", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    paddingBottom: "var(--gap-sm)",
  },
});

const CampoDeBusca = styled("input", {
  base: {
    flexGrow: 1,
    padding: "var(--gap-sm) var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    border: "1px solid var(--md-sys-color-outline-variant)",
    background: "var(--md-sys-color-surface-container-highest)",
    color: "var(--md-sys-color-on-surface)",
    "&:focus": { outline: "2px solid var(--md-sys-color-primary)" },
  },
});
