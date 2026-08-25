import {
  For,
  type JSX,
  Show,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

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
import MdVolumeUp from "@material-design-icons/svg/outlined/volume_up.svg?component-solid";
import MdVolumeOff from "@material-design-icons/svg/outlined/volume_off.svg?component-solid";

import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { useState } from "@revolt/state";
import {
  Button,
  IconButton,
  Slider,
  Text,
} from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";

import {
  type ClienteMusicBox,
  type Faixa,
  criarCliente,
  duracaoDaFila,
  duracaoLegivel,
  duracaoOuAoVivo,
} from "./estado";

/**
 * Painel do MusicBox, mostrado durante a chamada.
 *
 * Sem abas. A busca fica sempre no topo, pronta para receber o que se digita;
 * os resultados tomam o lugar da fila enquanto existirem e saem quando se
 * limpa a busca. Abas obrigavam a trocar de contexto para uma acao que e a
 * mais frequente do painel — botar musica.
 */
export function MusicBoxPanel(props: { channelId: string; onClose: () => void }) {
  const client = useClient();
  const instance = useInstance();

  const mb = criarCliente(
    instance.apiUrl,
    () => client().authenticationHeader,
    () => props.channelId,
  );

  const [termo, setTermo] = createSignal("");
  const [resultados, setResultados] = createSignal<Faixa[]>([]);
  const [buscando, setBuscando] = createSignal(false);
  const [aviso, setAviso] = createSignal<string>();
  const [adicionadas, setAdicionadas] = createSignal<Set<string>>(
    new Set<string>(),
  );

  /** Ha uma busca em andamento ou com resultado na tela. */
  const emBusca = () => buscando() || resultados().length > 0 || !!aviso();

  const ehPlaylist = () => /[?&]list=/.test(termo());

  onMount(() => {
    void mb.recarregar();

    // Sondagem enquanto o painel esta aberto. Um evento pelo WebSocket seria
    // melhor e e o destino disto, mas custa uma variante nova atravessando
    // backend, SDK e cliente.
    const relogio = setInterval(() => void mb.recarregar(), 2000);
    onCleanup(() => clearInterval(relogio));
  });

  async function buscar(e?: Event) {
    e?.preventDefault();
    if (!termo().trim()) return;

    setBuscando(true);
    setAviso(undefined);
    setAdicionadas(new Set<string>());
    try {
      // Playlist pede a lista inteira; busca por nome nao. Cem resultados
      // para "radiohead" e uma parede de texto onde bastavam alguns.
      const achadas = await mb.buscar(termo(), ehPlaylist() ? 200 : 15);
      setResultados(achadas);
      if (!achadas.length) setAviso("Nada encontrado para isso.");
    } catch (falha) {
      setResultados([]);
      setAviso(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setBuscando(false);
    }
  }

  function limparBusca() {
    setTermo("");
    setResultados([]);
    setAviso(undefined);
  }

  /**
   * Adiciona sem apagar a busca.
   *
   * Limpar a lista a cada faixa obrigava a repetir a mesma pesquisa para pegar
   * a segunda musica do mesmo album. O que ja entrou fica marcado — sem isso
   * nao da para saber o que ja foi.
   */
  async function adicionar(faixas: Faixa[]) {
    await mb.adicionar(faixas);
    setAdicionadas((antes) => {
      const agora = new Set(antes);
      for (const f of faixas) agora.add(f.id);
      return agora;
    });
  }

  return (
    <Painel>
      <AgoraTocando mb={mb} onClose={props.onClose} />

      <BarraDeBusca onSubmit={buscar}>
        <Lupa>
          <MdSearch />
        </Lupa>
        <Campo
          value={termo()}
          placeholder="Buscar musica, colar link de video ou playlist…"
          onInput={(e: InputEvent) =>
            setTermo((e.currentTarget as HTMLInputElement).value)
          }
          onKeyDown={(e: KeyboardEvent) => {
            // Escape limpa e devolve a fila, sem tirar o foco do campo.
            if (e.key === "Escape") limparBusca();
          }}
        />
        <Show when={termo()}>
          <IconButton onPress={limparBusca} aria-label="Limpar busca">
            <MdClose />
          </IconButton>
        </Show>
      </BarraDeBusca>

      <Corpo>
        <Show when={emBusca()} fallback={<Fila mb={mb} />}>
          <Resultados
            resultados={resultados()}
            buscando={buscando()}
            playlist={ehPlaylist()}
            aviso={aviso()}
            adicionadas={adicionadas()}
            onAdicionar={adicionar}
          />
        </Show>
      </Corpo>
    </Painel>
  );
}

/** Capa, titulo, progresso, controles e volume. */
function AgoraTocando(props: { mb: ClienteMusicBox; onClose: () => void }) {
  const atual = () => props.mb.estado().current;
  const duracao = () => atual()?.duration_s ?? 0;

  function girarRepeticao() {
    const agora = props.mb.estado().repeat;
    void props.mb.ajustar({
      repeat: agora === "off" ? "all" : agora === "all" ? "one" : "off",
    });
  }

  return (
    <Topo>
      <LinhaDoTopo>
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
            {atual()?.author ?? "Busque algo acima para comecar"}
          </Text>
        </Identificacao>

        <VolumeDaMusica mb={props.mb} />

        <IconButton onPress={props.onClose} aria-label="Fechar o MusicBox">
          <MdClose />
        </IconButton>
      </LinhaDoTopo>

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
          onPress={() =>
            void props.mb.ajustar({ shuffle: !props.mb.estado().shuffle })
          }
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

/**
 * Volume da musica, por ouvinte.
 *
 * Fica aqui e nao so no menu de contexto porque e um controle que se procura
 * enquanto a musica toca: escondido atras de clique direito, ninguem acha.
 *
 * Usa `change` e nao `input`. `input` dispara tambem quando o deslizante se
 * inicializa, antes de receber o valor que passamos, e aquele primeiro
 * disparo carrega o minimo — so abrir o painel baixava o volume sozinho, o
 * que parece defeito do audio e nao uma escrita perdida. `change` acontece
 * quando alguem solta o cursor, que e exatamente a intencao que interessa.
 */
function VolumeDaMusica(props: { mb: ClienteMusicBox }) {
  const state = useState();

  const identidade = () => props.mb.estado().bot_identity;
  const volume = () => {
    const id = identidade();
    return id ? state.voice.getUserVolume(id) : 1;
  };

  return (
    <Show when={identidade()}>
      {(id) => (
        <Volume>
          <IconButton
            onPress={() =>
              state.voice.setUserVolume(id(), volume() > 0 ? 0 : 1)
            }
            aria-label={volume() > 0 ? "Silenciar a musica" : "Tirar do mudo"}
          >
            <Show when={volume() > 0} fallback={<MdVolumeOff />}>
              <MdVolumeUp />
            </Show>
          </IconButton>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={volume()}
            onInput={(e) => state.voice.setUserVolume(id(), e.currentTarget.value)}
            onChange={(e) => state.voice.setUserVolume(id(), e.currentTarget.value)}
            labelFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          />
        </Volume>
      )}
    </Show>
  );
}

/** Resultados da busca. */
function Resultados(props: {
  resultados: Faixa[];
  buscando: boolean;
  playlist: boolean;
  aviso?: string;
  adicionadas: Set<string>;
  onAdicionar: (faixas: Faixa[]) => Promise<void>;
}) {
  return (
    <>
      <Show when={props.buscando}>
        <Vazio>
          <Text class="label">
            {props.playlist ? "Abrindo a playlist — pode demorar…" : "Buscando…"}
          </Text>
        </Vazio>
      </Show>

      <Show when={props.aviso}>
        {(mensagem) => (
          <Vazio>
            <Text class="label">{mensagem()}</Text>
          </Vazio>
        )}
      </Show>

      <Show when={props.resultados.length > 1}>
        <Resumo>
          <Text class="label">{props.resultados.length} resultados</Text>
          <Button
            variant="tonal"
            onPress={() => void props.onAdicionar(props.resultados)}
          >
            Adicionar todas
          </Button>
        </Resumo>
      </Show>

      <For each={props.resultados}>
        {(faixa) => (
          <Item>
            <Miniatura capa={faixa.cover_url} />
            <Identificacao>
              <Text class="body">{faixa.title}</Text>
              <Text class="label">{faixa.author ?? "desconhecido"}</Text>
            </Identificacao>
            <Text class="label">{duracaoOuAoVivo(faixa.duration_s)}</Text>
            <Button
              variant={props.adicionadas.has(faixa.id) ? "text" : "tonal"}
              onPress={() => void props.onAdicionar([faixa])}
            >
              {props.adicionadas.has(faixa.id) ? "Na fila" : "Adicionar"}
            </Button>
          </Item>
        )}
      </For>
    </>
  );
}

/** A fila da chamada. */
function Fila(props: { mb: ClienteMusicBox }) {
  return (
    <Show
      when={props.mb.estado().queue.length}
      fallback={
        <Vazio>
          <Text class="label">
            A fila esta vazia. Busque algo no campo acima.
          </Text>
        </Vazio>
      }
    >
      <Resumo>
        <Text class="label">
          {props.mb.estado().queue.length}{" "}
          {props.mb.estado().queue.length === 1 ? "faixa" : "faixas"} —{" "}
          {duracaoLegivel(duracaoDaFila(props.mb.estado()))} restantes
        </Text>
        <Button variant="text" onPress={() => void props.mb.limpar()}>
          Limpar
        </Button>
      </Resumo>

      <For each={props.mb.estado().queue}>
        {(faixa, indice) => (
          <Item>
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
          </Item>
        )}
      </For>
    </Show>
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
 * O painel nao pinta fundo proprio.
 *
 * Ele e a unica coisa na area da chamada, e uma superficie sobre a outra
 * criava uma moldura visivel que competia com o tema. Herdar o fundo do
 * cartao e o que faz os dois virarem uma peca so.
 */
const Painel = styled("div", {
  base: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    color: "var(--md-sys-color-on-surface)",
  },
});

const Topo = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    padding: "var(--gap-md) var(--gap-md) var(--gap-sm)",
    flexShrink: 0,
  },
});

const LinhaDoTopo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
  },
});

const Capa = styled("div", {
  base: {
    width: "56px",
    height: "56px",
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

/** Volume fica a direita do que toca, onde se procura por ele. */
const Volume = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-xs)",
    flexShrink: 0,
    width: "170px",

    "& mdui-slider": { flexGrow: 1, minWidth: 0 },
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

const Destaque = styled("div", {
  base: {
    display: "contents",
    "& button": {
      background: "var(--md-sys-color-primary)",
      color: "var(--md-sys-color-on-primary)",
    },
    "& button:hover": { background: "var(--md-sys-color-primary)" },
  },
});

/** A busca vive no topo do corpo, sempre pronta. */
const BarraDeBusca = styled("form", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    margin: "0 var(--gap-md) var(--gap-sm)",
    padding: "0 var(--gap-md)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-highest)",

    "&:focus-within": {
      outline: "2px solid var(--md-sys-color-primary)",
    },
  },
});

const Lupa = styled("div", {
  base: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    color: "var(--md-sys-color-on-surface-variant)",
  },
});

const Campo = styled("input", {
  base: {
    flexGrow: 1,
    minWidth: 0,
    padding: "var(--gap-md) 0",
    border: "none",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "0.95rem",
    "&:focus": { outline: "none" },
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
    padding: "0 var(--gap-md) var(--gap-md)",
  },
});

const Resumo = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: "var(--gap-sm)",
  },
});

const Item = styled("div", {
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
