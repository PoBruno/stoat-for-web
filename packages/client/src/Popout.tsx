import { Show, createSignal, onCleanup, onMount } from "solid-js";

import {
  type FonteDeAnotacao,
  CamadaAnotacao,
} from "@revolt/rtc/CamadaAnotacao";
import type {
  EstadoDaAnotacaoNoPopout,
  PonteDeAnotacao,
} from "@revolt/rtc/popout";

/**
 * A janela destacada de uma tela compartilhada.
 *
 * Rota deliberadamente FORA do shell do app: ela e irma de `/login` na tabela
 * de rotas, nao filha de `/`. Se fosse filha, dois guards a sequestrariam --
 * o redirecionamento para `/login` de `Interface.tsx:95-97` e o gate de
 * carregamento do `InstanceContext`, que segura os filhos ate a API
 * responder. Esta janela nao fala com a API: ela so desenha um objeto que ja
 * existe na janela mae.
 *
 * Sem provider nenhum, de proposito. Puxar o tema arrastaria o cliente
 * inteiro (`LoadTheme` -> `useClientLifecycle` -> `ClientContext` ->
 * `InstanceContext`), e o fundo escuro ja vem do CSS base.
 *
 * O video e MUDO: o audio da tela ja toca pelo `RoomAudioManager` da janela
 * principal, e deixar som aqui sairia dobrado.
 *
 * O laser (desenhar na tela de quem liberou) tambem funciona aqui: a mae
 * entrega uma `PonteDeAnotacao` e a mesma `CamadaAnotacao` do tile desenha
 * por cima deste video. Import de modulo e ok, so nao pode ter provider.
 */
export default function Popout() {
  let ref: HTMLVideoElement | undefined;

  const [erro, setErro] = createSignal<string>();
  const [controlesVisiveis, setControlesVisiveis] = createSignal(false);
  const [noTopo, setNoTopo] = createSignal(false);
  const [armado, setArmado] = createSignal(false);
  const [anotacao, setAnotacao] = createSignal<FonteDeAnotacao>();
  const [estadoAnotacao, setEstadoAnotacao] =
    createSignal<EstadoDaAnotacaoNoPopout>();

  const params = new URLSearchParams(location.search);
  const sid = params.get("sid") ?? "";
  const titulo = params.get("titulo") ?? "Tela compartilhada";

  /** Se da para fixar sobre as outras janelas — so no app desktop. */
  const podeFixar = () =>
    typeof window.native?.popoutAlwaysOnTop === "function";

  onMount(() => {
    document.title = titulo;

    const mae = window.opener as
      | {
          __stoatPopout?: {
            pegar: (s: string) => MediaStream | undefined;
            anotacao?: (s: string) => PonteDeAnotacao | undefined;
            encerrar: (s: string) => void;
          };
        }
      | null
      | undefined;

    if (!mae?.__stoatPopout) {
      setErro("A janela principal do Stoat não está mais aberta.");
      return;
    }

    const stream = mae.__stoatPopout.pegar(sid);
    if (!stream) {
      setErro("Este compartilhamento terminou.");
      return;
    }

    if (ref) {
      ref.srcObject = stream;
      ref.play().catch(() => undefined);
    }

    // Laser: a mae observa os proprios signals e avisa por callback; aqui
    // viram signals locais, do Solid desta janela. `anotacao` pode faltar se
    // a mae for de um bundle anterior a esta feature.
    const ponte = mae.__stoatPopout.anotacao?.(sid);
    let cancelarAnotacao: (() => void) | undefined;
    if (ponte) {
      const [tique, setTique] = createSignal(0);
      setAnotacao({
        tique,
        vivos: () => ponte.vivos(),
        opacidade: (t) => ponte.opacidade(t),
        comecar: (u, v) => ponte.comecar(u, v),
        continuar: (pontos) => ponte.continuar(pontos),
        terminar: () => ponte.terminar(),
        enviarLote: () => ponte.enviarLote(),
      });
      cancelarAnotacao = ponte.inscrever((estado) => {
        setTique(estado.tique);
        setEstadoAnotacao(estado);
        // Quem compartilha revogou: sai do modo de desenho sozinho.
        if (!estado.liberado) setArmado(false);
      });
    }

    // A faixa acabou: quem compartilhava parou. Fecha em vez de deixar o
    // ultimo quadro congelado passando por transmissao ao vivo.
    const faixa = stream.getVideoTracks()[0];
    const aoTerminar = () => window.close();
    faixa?.addEventListener("ended", aoTerminar);

    // A janela mae recarregou ou fechou: o objeto morre junto e nao ha como
    // recuperar. `opener.closed` cobre o fechamento; o try/catch cobre a
    // navegacao, que invalida o acesso.
    const vigiaMae = setInterval(() => {
      try {
        if (!window.opener || window.opener.closed) window.close();
      } catch {
        window.close();
      }
    }, 1000);

    const aoFechar = () => {
      try {
        cancelarAnotacao?.();
      } catch {
        /* idem */
      }
      try {
        mae.__stoatPopout?.encerrar(sid);
      } catch {
        /* a mae pode ter morrido antes */
      }
    };
    window.addEventListener("pagehide", aoFechar);

    onCleanup(() => {
      cancelarAnotacao?.();
      faixa?.removeEventListener("ended", aoTerminar);
      clearInterval(vigiaMae);
      window.removeEventListener("pagehide", aoFechar);
    });
  });

  /** Mostra os controles e some sozinho — padrao de player de video. */
  let sumir: ReturnType<typeof setTimeout> | undefined;
  const aoMover = () => {
    setControlesVisiveis(true);
    clearTimeout(sumir);
    sumir = setTimeout(() => setControlesVisiveis(false), 2000);
  };
  onCleanup(() => clearTimeout(sumir));

  /** Se o botao de desenhar aparece: quem compartilha liberou. */
  const podeDesenhar = () => !!anotacao() && !!estadoAnotacao()?.liberado;

  /** Arma/desarma; sem permissao de falar, explica em vez de armar. */
  function alternarDesenho() {
    if (!estadoAnotacao()?.podePublicar) {
      alert(
        "Você precisa de permissão para falar neste canal para desenhar. Peça a um moderador.",
      );
      return;
    }
    setArmado((a) => !a);
  }

  function alternarTopo() {
    const novo = !noTopo();
    setNoTopo(novo);
    window.native?.popoutAlwaysOnTop?.(novo);
  }

  return (
    <div
      onMouseMove={aoMover}
      onMouseLeave={() => setControlesVisiveis(false)}
      style={{
        position: "fixed",
        inset: "0",
        background: "#000",
        overflow: "hidden",
      }}
    >
      <Show
        when={!erro()}
        fallback={
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              height: "100%",
              color: "#bbb",
              "font-family": "system-ui, sans-serif",
              "font-size": "14px",
              padding: "24px",
              "text-align": "center",
            }}
          >
            {erro()}
          </div>
        }
      >
        <video
          ref={ref}
          autoplay
          muted
          playsinline
          style={{
            width: "100%",
            height: "100%",
            "object-fit": "contain",
            display: "block",
          }}
        />
        <Show when={anotacao()}>
          <CamadaAnotacao
            anotacao={anotacao()!}
            video={() => ref}
            armado={armado()}
            aoDesarmar={() => setArmado(false)}
          />
        </Show>
      </Show>

      <Show
        when={
          (podeFixar() || podeDesenhar()) &&
          (controlesVisiveis() || armado()) &&
          !erro()
        }
      >
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            display: "flex",
            gap: "8px",
            // Acima do canvas do laser (z-index 2), senao armado o clique
            // nos botoes viraria traco.
            "z-index": "3",
          }}
        >
          <Show when={podeDesenhar()}>
            <button
              onClick={alternarDesenho}
              title={
                armado()
                  ? "Parar de desenhar (Esc)"
                  : "Desenhar nesta tela (todos na call veem)"
              }
              style={estiloBotao(armado())}
            >
              {armado() ? "✏️ Desenhando — Esc para sair" : "✏️ Desenhar"}
            </button>
          </Show>
          <Show when={podeFixar()}>
            <button
              onClick={alternarTopo}
              title={
                noTopo()
                  ? "Desafixar (deixar de ficar sobre as outras janelas)"
                  : "Fixar sobre as outras janelas"
              }
              style={estiloBotao(noTopo())}
            >
              {noTopo() ? "Fixado no topo" : "Fixar no topo"}
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/**
 * Estilo dos botoes flutuantes da janela. Inline porque esta rota nao carrega
 * tema nem provider (ver o comentario do componente).
 */
function estiloBotao(ligado: boolean) {
  return {
    border: "none",
    "border-radius": "8px",
    padding: "8px 12px",
    cursor: "pointer",
    "font-family": "system-ui, sans-serif",
    "font-size": "13px",
    background: ligado ? "#5470ec" : "rgba(0,0,0,.6)",
    color: "#fff",
    "backdrop-filter": "blur(6px)",
  } as const;
}
