import { For, Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";

import { styled } from "styled-system/jsx";

import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";
import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdMusic from "@material-design-icons/svg/outlined/music_note.svg?component-solid";
import MdPause from "@material-design-icons/svg/outlined/pause.svg?component-solid";
import MdPlay from "@material-design-icons/svg/outlined/play_arrow.svg?component-solid";
import MdRepeat from "@material-design-icons/svg/outlined/repeat.svg?component-solid";
import MdRepeatOne from "@material-design-icons/svg/outlined/repeat_one.svg?component-solid";
import MdSearch from "@material-design-icons/svg/outlined/search.svg?component-solid";
import MdShuffle from "@material-design-icons/svg/outlined/shuffle.svg?component-solid";
import MdNext from "@material-design-icons/svg/outlined/skip_next.svg?component-solid";
import MdStop from "@material-design-icons/svg/outlined/stop.svg?component-solid";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { Button, IconButton, Row, Slider, Text } from "@revolt/ui";

import {
  type ClienteMusicBox,
  type Faixa,
  criarCliente,
  duracaoDaFila,
  duracaoLegivel,
  duracaoOuAoVivo,
} from "./estado";

type Aba = "fila" | "buscar";

/**
 * Painel do MusicBox, mostrado durante a chamada.
 *
 * Ocupa a maior parte da altura, ao contrario do soundboard: uma fila de
 * musica e uma lista que a pessoa fica olhando e reordenando, nao um punhado
 * de botoes para apertar de relance.
 *
 * Todo o estado vem do servidor. A fila e da CHAMADA, nao desta aba: duas
 * pessoas veem a mesma coisa, e fechar o navegador nao apaga o que os outros
 * estao ouvindo.
 */
export function MusicBoxPanel(props: { channelId: string; onClose: () => void }) {
  const [aba, setAba] = createSignal<Aba>("fila");

  const client = useClient();
  const instance = useInstance();

  const mb = criarCliente(
    instance.apiUrl,
    () => client().authenticationHeader,
    () => props.channelId,
  );

  onMount(() => {
    void mb.recarregar();

    // Sondagem enquanto o painel esta aberto.
    //
    // Um evento pelo WebSocket seria melhor e e o destino disto, mas custa
    // uma variante nova de evento atravessando backend, SDK e cliente. Dois
    // segundos de intervalo, so com o painel aberto, carrega um JSON pequeno
    // -- e a barra de posicao anda porque o SERVIDOR projeta o tempo entre os
    // avisos do agente, nao porque a tela esta chutando.
    const relogio = setInterval(() => void mb.recarregar(), 2000);
    onCleanup(() => clearInterval(relogio));
  });

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

      <Show when={mb.erro()}>
        {(mensagem) => (
          <Aviso>
            <Text class="label">{mensagem()}</Text>
          </Aviso>
        )}
      </Show>

      <AgoraTocando mb={mb} />

      <Abas>
        <BotaoAba
          aria-selected={aba() === "fila"}
          data-ativa={aba() === "fila"}
          onClick={() => setAba("fila")}
        >
          Fila
          <Show when={mb.estado().queue.length}>
            <Contagem>{mb.estado().queue.length}</Contagem>
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
            <Fila mb={mb} />
          </Match>
          <Match when={aba() === "buscar"}>
            <Busca mb={mb} />
          </Match>
        </Switch>
      </Corpo>
    </Painel>
  );
}

/** Capa, titulo, progresso e controles da faixa atual. */
function AgoraTocando(props: { mb: ClienteMusicBox }) {
  const atual = () => props.mb.estado().current;
  const duracao = () => atual()?.duration_s ?? 0;

  /** Repeticao gira entre os tres modos no mesmo botao. */
  function girarRepeticao() {
    const agora = props.mb.estado().repeat;
    void props.mb.ajustar({
      repeat: agora === "off" ? "all" : agora === "all" ? "one" : "off",
    });
  }

  return (
    <Topo>
      <Row gap="md" align>
        <Capa>
          <Show
            when={atual()?.cover_url}
            fallback={<MdMusic style={{ opacity: 0.4 }} />}
          >
            {(capa) => <img src={capa()} alt="" />}
          </Show>
        </Capa>

        <Identificacao>
          <TituloAtual>
            <Text class="body">{atual()?.title ?? "Nada tocando"}</Text>
          </TituloAtual>
          <Text class="label">
            {atual()?.author ?? "Adicione algo pela aba Buscar"}
          </Text>
        </Identificacao>
      </Row>

      <Progresso>
        <Slider
          min={0}
          max={Math.max(1, duracao())}
          value={Math.min(props.mb.estado().position_s, Math.max(1, duracao()))}
          labelFormatter={duracaoLegivel}
        />
        <LinhaDeTempo>
          <Text class="label">
            {duracaoLegivel(props.mb.estado().position_s)}
          </Text>
          <Text class="label">
            {atual() ? duracaoOuAoVivo(duracao()) : "--:--"}
          </Text>
        </LinhaDeTempo>
      </Progresso>

      <Controles>
        <IconButton
          onPress={() => void props.mb.ajustar({ shuffle: !props.mb.estado().shuffle })}
          variant={props.mb.estado().shuffle ? "tonal" : "standard"}
          aria-label="Ordem aleatoria"
        >
          <MdShuffle />
        </IconButton>

        <IconButton
          onPress={() => void props.mb.parar()}
          isDisabled={!atual()}
          aria-label="Parar e limpar"
        >
          <MdStop />
        </IconButton>

        <BotaoTocar
          onPress={() => void props.mb.alternar()}
          isDisabled={!atual()}
          aria-label={props.mb.estado().playing ? "Pausar" : "Tocar"}
        >
          <Show when={props.mb.estado().playing} fallback={<MdPlay />}>
            <MdPause />
          </Show>
        </BotaoTocar>

        <IconButton
          onPress={() => void props.mb.proxima()}
          isDisabled={!props.mb.estado().queue.length}
          aria-label="Proxima"
        >
          <MdNext />
        </IconButton>

        <IconButton
          onPress={girarRepeticao}
          variant={props.mb.estado().repeat === "off" ? "standard" : "tonal"}
          aria-label={`Repeticao: ${props.mb.estado().repeat}`}
        >
          <Show
            when={props.mb.estado().repeat === "one"}
            fallback={<MdRepeat />}
          >
            <MdRepeatOne />
          </Show>
        </IconButton>
      </Controles>
    </Topo>
  );
}

/** Lista da fila. */
function Fila(props: { mb: ClienteMusicBox }) {
  return (
    <Show
      when={props.mb.estado().queue.length}
      fallback={
        <Vazio>
          <Text class="label">A fila esta vazia.</Text>
        </Vazio>
      }
    >
      <ResumoDaFila>
        <Text class="label">
          {props.mb.estado().queue.length}{" "}
          {props.mb.estado().queue.length === 1 ? "faixa" : "faixas"} —{" "}
          {duracaoLegivel(duracaoDaFila(props.mb.estado()))} restantes
        </Text>
        <Button variant="text" onPress={() => void props.mb.limpar()}>
          Limpar
        </Button>
      </ResumoDaFila>

      <For each={props.mb.estado().queue}>
        {(faixa, indice) => (
          <ItemDaFila>
            <Posicao>
              <Text class="label">{indice() + 1}</Text>
            </Posicao>

            <Miniatura capa={faixa.cover_url} />

            <Identificacao onClick={() => void props.mb.tocarDaFila(indice())}>
              <Text class="body">{faixa.title}</Text>
              <Text class="label">{faixa.author ?? "desconhecido"}</Text>
            </Identificacao>

            <Text class="label">{duracaoOuAoVivo(faixa.duration_s)}</Text>

            <IconButton
              onPress={() => void props.mb.remover(indice())}
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
function Busca(props: { mb: ClienteMusicBox }) {
  const [termo, setTermo] = createSignal("");
  const [resultados, setResultados] = createSignal<Faixa[]>([]);
  const [aviso, setAviso] = createSignal<string>();
  const [buscando, setBuscando] = createSignal(false);

  const ehPlaylist = () => /[?&]list=/.test(termo());

  async function enviar(e: Event) {
    e.preventDefault();
    if (!termo().trim()) return;

    setBuscando(true);
    setAviso(undefined);
    try {
      // Playlist pede a lista inteira; busca por nome nao. Cem resultados
      // para "radiohead" e uma parede de texto onde bastavam alguns.
      const achadas = await props.mb.buscar(termo(), ehPlaylist() ? 200 : 15);
      setResultados(achadas);
      if (!achadas.length) setAviso("Nada encontrado para isso.");
    } catch (falha) {
      setResultados([]);
      setAviso(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setBuscando(false);
    }
  }

  async function adicionar(faixas: Faixa[]) {
    await props.mb.adicionar(faixas);
    setResultados([]);
    setTermo("");
  }

  return (
    <>
      <FormaDeBusca onSubmit={enviar}>
        <CampoDeBusca
          value={termo()}
          placeholder="Nome da musica, link do video ou da playlist"
          onInput={(e: InputEvent) =>
            setTermo((e.currentTarget as HTMLInputElement).value)
          }
        />
        <IconButton type="submit" aria-label="Buscar">
          <MdSearch />
        </IconButton>
      </FormaDeBusca>

      <Show when={aviso()}>
        {(mensagem) => (
          <Vazio>
            <Text class="label">{mensagem()}</Text>
          </Vazio>
        )}
      </Show>

      <Show when={buscando()}>
        <Vazio>
          <Text class="label">
            {ehPlaylist() ? "Abrindo a playlist — pode demorar…" : "Buscando…"}
          </Text>
        </Vazio>
      </Show>

      <Show when={resultados().length > 1}>
        <ResumoDaFila>
          <Text class="label">{resultados().length} resultados</Text>
          <Button variant="tonal" onPress={() => void adicionar(resultados())}>
            Adicionar todas
          </Button>
        </ResumoDaFila>
      </Show>

      <For each={resultados()}>
        {(faixa) => (
          <ItemDaFila>
            <Miniatura capa={faixa.cover_url} />
            <Identificacao>
              <Text class="body">{faixa.title}</Text>
              <Text class="label">{faixa.author ?? "desconhecido"}</Text>
            </Identificacao>
            <Text class="label">{duracaoOuAoVivo(faixa.duration_s)}</Text>
            <Button variant="tonal" onPress={() => void adicionar([faixa])}>
              Adicionar
            </Button>
          </ItemDaFila>
        )}
      </For>
    </>
  );
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
 * Miniatura de item de lista.
 *
 * `loading="lazy"` nao e detalhe: uma playlist de 100 faixas dispararia 100
 * requisicoes de imagem de uma vez, sendo que so um punhado esta na tela.
 */
function Miniatura(props: { capa: string | null }) {
  return (
    <MiniCapa>
      <Show when={props.capa} fallback={<MdMusic style={{ opacity: 0.4 }} />}>
        {(capa) => <img src={capa()} alt="" loading="lazy" />}
      </Show>
    </MiniCapa>
  );
}

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
