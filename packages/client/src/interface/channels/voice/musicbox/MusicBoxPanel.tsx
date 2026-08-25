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
import { useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";

import {
  type Faixa,
  acoes,
  duracaoDaFila,
  duracaoLegivel,
  duracaoOuAoVivo,
  estado,
} from "./estado";

type Aba = "fila" | "buscar";

/**
 * Painel do MusicBox, mostrado durante a chamada.
 *
 * Ocupa a altura inteira da area da chamada, ao contrario do soundboard: uma
 * fila de musica e uma lista que a pessoa fica olhando e reordenando, nao um
 * punhado de botoes para apertar de relance.
 */
export function MusicBoxPanel(props: { channelId: string; onClose: () => void }) {
  const [aba, setAba] = createSignal<Aba>("fila");
  const [falha, setFalha] = createSignal<string>();

  const client = useClient();
  const instance = useInstance();

  /**
   * Manda tocar e so entao muda o estado da tela.
   *
   * A ordem importa: pintar como "tocando" antes de o servidor confirmar
   * deixaria o painel mentindo sempre que o agente estivesse fora do ar.
   */
  async function tocarFaixa(faixa: Faixa) {
    setFalha(undefined);
    try {
      await mandarTocar(
        instance.apiUrl,
        client().authenticationHeader,
        props.channelId,
        faixa,
      );
      return true;
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : String(erro));
      return false;
    }
  }

  async function pararTudo() {
    setFalha(undefined);
    try {
      await mandarParar(
        instance.apiUrl,
        client().authenticationHeader,
        props.channelId,
      );
    } catch {
      // Parar que falha nao merece alarde: o proximo tocar substitui.
    }
  }

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

      <Show when={falha()}>
        {(mensagem) => (
          <Aviso>
            <Text class="label">{mensagem()}</Text>
          </Aviso>
        )}
      </Show>

      <AgoraTocando aoTocar={tocarFaixa} aoParar={pararTudo} />

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
            <Fila aoTocar={tocarFaixa} />
          </Match>
          <Match when={aba() === "buscar"}>
            <Busca channelId={props.channelId} aoTocar={tocarFaixa} />
          </Match>
        </Switch>
      </Corpo>
    </Painel>
  );
}

/** Capa, titulo, progresso e controles da faixa atual. */
function AgoraTocando(props: {
  aoTocar: (faixa: Faixa) => Promise<boolean>;
  aoParar: () => Promise<void>;
}) {
  const semFaixa = () => !estado.atual;

  /** Tocar/pausar de verdade: quem toca o som e o agente, nao o navegador. */
  async function alternar() {
    const faixa = estado.atual;
    if (!faixa) return;

    if (estado.tocando) {
      await props.aoParar();
      acoes.tocarOuPausar();
      return;
    }

    if (await props.aoTocar(faixa)) acoes.tocarOuPausar();
  }

  /** Pula e ja manda tocar a que assumiu o lugar. */
  async function proxima() {
    acoes.proxima();
    const faixa = estado.atual;
    if (faixa) {
      await props.aoTocar(faixa);
    } else {
      await props.aoParar();
    }
  }

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
            {estado.atual ? duracaoOuAoVivo(estado.atual.duracao) : "--:--"}
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
          onPress={alternar}
          isDisabled={semFaixa()}
          aria-label={estado.tocando ? "Pausar" : "Tocar"}
        >
          <Show when={estado.tocando} fallback={<MdPlay />}>
            <MdPause />
          </Show>
        </BotaoTocar>

        <IconButton
          onPress={proxima}
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
function Fila(props: { aoTocar: (faixa: Faixa) => Promise<boolean> }) {
  const [arrastando, setArrastando] = createSignal<number>();

  /** Puxa uma faixa da fila para a frente e ja manda tocar. */
  async function tocarAgora(indice: number) {
    acoes.tocarAgora(indice);
    if (estado.atual) await props.aoTocar(estado.atual);
  }

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

            <Miniatura capa={faixa.capa} />

            <Identificacao onClick={() => void tocarAgora(indice())}>
              <Text class="body">{faixa.titulo}</Text>
              <Text class="label">{faixa.autor}</Text>
            </Identificacao>

            <Text class="label">{duracaoOuAoVivo(faixa.duracao)}</Text>

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
function Busca(props: {
  channelId: string;
  aoTocar: (faixa: Faixa) => Promise<boolean>;
}) {
  const client = useClient();
  const instance = useInstance();

  const [termo, setTermo] = createSignal("");
  const [resultados, setResultados] = createSignal<Faixa[]>([]);
  const [erro, setErro] = createSignal<string>();
  const [buscando, setBuscando] = createSignal(false);

  const ehPlaylist = () => /[?&]list=/.test(termo());

  /**
   * Adiciona e, se nada estava tocando, ja comeca.
   *
   * Sem isso a primeira faixa entraria como "atual" no painel mas em silencio,
   * e a pessoa teria de apertar tocar para algo que parece ja estar tocando.
   */
  async function adicionar(faixa: Faixa) {
    const estavaVazio = !estado.atual;
    acoes.adicionar(faixa);
    if (estavaVazio && estado.atual) await props.aoTocar(estado.atual);
  }

  async function enviar(e: Event) {
    e.preventDefault();
    if (!termo().trim()) return;

    setBuscando(true);
    setErro(undefined);
    try {
      const achadas = await buscarFaixas(
        instance.apiUrl,
        client().authenticationHeader,
        props.channelId,
        termo(),
        // Playlist pede a lista inteira; busca por nome nao. Cem resultados
        // para "radiohead" e uma parede de texto onde bastavam alguns.
        ehPlaylist() ? 200 : 15,
      );
      setResultados(achadas);
      if (!achadas.length) setErro("Nada encontrado para isso.");
    } catch (falha) {
      setResultados([]);
      setErro(falha instanceof Error ? falha.message : String(falha));
    } finally {
      setBuscando(false);
    }
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

      <Show when={erro()}>
        {(mensagem) => (
          <Vazio>
            <Text class="label">{mensagem()}</Text>
          </Vazio>
        )}
      </Show>

      <Show when={buscando()}>
        <Vazio>
          <Text class="label">
            {ehPlaylist()
              ? "Abrindo a playlist — pode demorar…"
              : "Buscando…"}
          </Text>
        </Vazio>
      </Show>

      <Show when={resultados().length > 1}>
        <ResumoDaFila>
          <Text class="label">
            {resultados().length} resultados
          </Text>
          <Button
            variant="tonal"
            onPress={() => {
              void (async () => {
                for (const faixa of resultados()) await adicionar(faixa);
                setResultados([]);
                setTermo("");
              })();
            }}
          >
            Adicionar todas
          </Button>
        </ResumoDaFila>
      </Show>

      <For each={resultados()}>
        {(faixa) => (
          <ItemDaFila>
            <Miniatura capa={faixa.capa} />
            <Identificacao>
              <Text class="body">{faixa.titulo}</Text>
              <Text class="label">{faixa.autor}</Text>
            </Identificacao>
            <Text class="label">{duracaoOuAoVivo(faixa.duracao)}</Text>
            <Button variant="tonal" onPress={() => void adicionar(faixa)}>
              Adicionar
            </Button>
          </ItemDaFila>
        )}
      </For>
    </>
  );
}

/** Manda o servidor tocar uma faixa na chamada deste canal. */
async function mandarTocar(
  apiUrl: string,
  cabecalho: [string, string],
  channelId: string,
  faixa: Faixa,
): Promise<void> {
  const [chave, valor] = cabecalho;
  const resposta = await fetch(`${apiUrl}/musicbox/${channelId}/play`, {
    method: "POST",
    headers: { "content-type": "application/json", [chave]: valor },
    // O servidor espera a faixa no formato dele, nao no do painel.
    body: JSON.stringify({
      track: {
        id: faixa.id,
        provider: faixa.fonte,
        title: faixa.titulo,
        author: faixa.autor,
        duration_s: faixa.duracao || null,
        cover_url: faixa.capa ?? null,
        page_url: faixa.pagina,
      },
    }),
  });

  if (!resposta.ok) throw new Error(`Nao consegui tocar (${resposta.status}).`);
}

/** Manda parar o que estiver tocando. */
async function mandarParar(
  apiUrl: string,
  cabecalho: [string, string],
  channelId: string,
): Promise<void> {
  const [chave, valor] = cabecalho;
  await fetch(`${apiUrl}/musicbox/${channelId}/stop`, {
    method: "POST",
    headers: { [chave]: valor },
  });
}

/**
 * Costura da busca com o servidor.
 *
 * Usa `fetch` em vez de `client().api.post` de proposito: aquele caminho so
 * serializa o corpo de rotas que existem no SDK gerado a partir do OpenAPI, e
 * `/musicbox` nao existe la. Com rota desconhecida ele manda o corpo VAZIO sem
 * reclamar, e o servidor recusaria um pedido sem consulta nenhuma.
 */
async function buscarFaixas(
  apiUrl: string,
  cabecalho: [string, string],
  channelId: string,
  termo: string,
  limite: number,
): Promise<Faixa[]> {
  const [chave, valor] = cabecalho;

  const resposta = await fetch(`${apiUrl}/musicbox/${channelId}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", [chave]: valor },
    body: JSON.stringify({ query: termo, limit: limite }),
  });

  if (!resposta.ok) {
    // O backend responde FeatureDisabled quando nao ha agente batendo ponto.
    // Distinguir isso de uma falha qualquer importa: um pede "ligue o agente",
    // o outro pede "tente de novo".
    const corpo = await resposta.json().catch(() => null);
    const tipo = corpo?.type as string | undefined;

    if (tipo === "FeatureDisabled") {
      throw new Error(
        corpo?.feature === "musicbox:agent"
          ? "Nenhum agente de musica esta conectado agora."
          : "O MusicBox nao esta configurado neste servidor.",
      );
    }
    throw new Error(`A busca falhou (${resposta.status}).`);
  }

  const dados = (await resposta.json()) as {
    tracks: {
      id: string;
      provider: string;
      title: string;
      author: string | null;
      duration_s: number | null;
      cover_url: string | null;
      page_url: string;
    }[];
  };

  return dados.tracks.map((t) => ({
    id: t.id,
    fonte: t.provider as Faixa["fonte"],
    titulo: t.title,
    autor: t.author ?? "desconhecido",
    // Transmissao ao vivo vem sem duracao; zero e como o painel representa isso.
    duracao: t.duration_s ?? 0,
    capa: t.cover_url ?? undefined,
    pagina: t.page_url,
  }));
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
function Miniatura(props: { capa?: string }) {
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
