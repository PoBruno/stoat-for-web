import { createSignal, Show } from "solid-js";
import {
  TrackReference,
  TrackReferenceOrPlaceholder,
  useEnsureParticipant,
  useIsMuted,
  useIsSpeaking,
  useTrackRefContext,
  VideoTrack,
} from "solid-livekit-components";

import { useLingui } from "@lingui/solid/macro";
import { Track } from "livekit-client";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { UserContextMenu } from "@revolt/app";
import { useUser } from "@revolt/markdown/users";
import { useVoice } from "@revolt/rtc";
import { CamadaAnotacao } from "@revolt/rtc/CamadaAnotacao";
import {
  abrirPopout,
  fecharPopout,
  popoutDisponivel,
  temPopout,
} from "@revolt/rtc/popout";
import { useState } from "@revolt/state";
import { Avatar } from "@revolt/ui/components/design";
import { Row } from "@revolt/ui/components/layout";
import { OverflowingText } from "@revolt/ui/components/utils";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { VoiceStatefulUserIcons } from "../VoiceStatefulUserIcons";

type TileProps = {
  /** Rendered on the stage (fills its grid cell) rather than in the filmstrip */
  stage?: boolean;
};

/**
 * Individual participant tile
 */
export function ParticipantTile(props: TileProps) {
  const voice = useVoice();
  const participant = useEnsureParticipant();
  const track = useTrackRefContext();
  const user = useUser(participant.identity);

  let videoRef: HTMLVideoElement | undefined;

  /** Se o ponteiro deste usuario esta produzindo tracos neste tile */
  const [armado, setArmado] = createSignal(false);

  /** Contentor do tile, usado para achar o <video> real */
  let caixa: HTMLDivElement | undefined;

  /**
   * O elemento <video> deste tile.
   *
   * Por `querySelector` e nao pelo `ref`: o `VideoTrack` do
   * solid-livekit-components usa um ref interno e so repassa o do chamador via
   * spread de `elementProps`, entao `videoRef` acima nunca e preenchido. Nao
   * vale forkar o pacote (e upstream) por causa disto.
   *
   * @returns o elemento, se ja montado
   */
  const acharVideo = () => caixa?.querySelector("video") ?? undefined;

  /**
   * Se este usuario pode desenhar sobre esta tela.
   *
   * Tres condicoes: e um compartilhamento de tela, nao e o MEU (desenhar na
   * propria tela nao faz sentido — eu ja estou olhando para ela), e quem
   * compartilha liberou.
   */
  const podeDesenhar = () =>
    isScreenShare() &&
    !user().user?.self &&
    !!voice.anotacao()?.liberadoPor().includes(participant.identity);

  const isMuted = useIsMuted({
    participant,
    source: Track.Source.Microphone,
  });

  const isScreenShareAudioMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShareAudio,
  });

  const isRemoteScreenShareMuted = useIsMuted({
    participant,
    source: Track.Source.ScreenShare,
  });

  const isVideoMuted = useIsMuted({
    participant,
    source: Track.Source.Camera,
  });

  const isVideo = () => !isVideoMuted();
  const isScreenShare = () => track.source === Track.Source.ScreenShare;
  const isSpeaking = useIsSpeaking(participant);

  return (
    <Show when={!isScreenShare() || !isRemoteScreenShareMuted()}>
      <div
        ref={caixa}
        class={
          tile({
            speaking: !isScreenShare() && isSpeaking(),
            video: isVideo() || isScreenShare(),
            fullscreen: voice.fullscreen(),
            pinned: voice.isPinned(track),
            stage: props.stage,
          }) + (isScreenShare() ? " vc_tile group" : " vc_tile")
        }
        onClick={() => {
          // Armado, o clique pertence ao traco: sem esta guarda cada risco
          // fixaria e desfixaria o tile.
          if (armado()) return;
          voice.togglePin(track);
        }}
        use:floating={{
          // TODO: Conflicts with focusing, maybe only show if clicking name itself
          //   userCard: {
          //     user: user().user!,
          //     member: user().member,
          //   },
          contextMenu: () => (
            <UserContextMenu
              user={user().user!}
              member={user().member}
              inVoice={!isScreenShare()}
              isScreenshare={isScreenShare()}
            />
          ),
        }}
      >
        <Show
          when={isVideo() || isScreenShare()}
          fallback={
            <AvatarOnly>
              <Avatar
                src={user().avatar}
                fallback={user().username}
                size={48}
                interactive={false}
              />
            </AvatarOnly>
          }
        >
          <VideoTrack
            style={{
              "grid-area": "1/1",
              "object-fit": "contain",
              width: "100%",
              height: "100%",
              overflow: "hidden",
            }}
            trackRef={track as TrackReference}
            manageSubscription={true}
            ref={videoRef}
          />
        </Show>
        <Show when={isScreenShare() && voice.anotacao()}>
          <CamadaAnotacao
            anotacao={voice.anotacao()!}
            video={acharVideo}
            armado={armado()}
            aoDesarmar={() => setArmado(false)}
          />
        </Show>
        <Overlay showOnHover={isScreenShare()}>
          <OverlayInner>
            <OverflowingText>{user().username}</OverflowingText>
            <Row gap="md">
              <Show when={isScreenShare()}>
                <BotaoDestacar track={track} nome={user().username} />
              </Show>
              <Show when={podeDesenhar()}>
                <BotaoDesenhar
                  armado={armado()}
                  aoAlternar={() => {
                    const novo = !armado();
                    setArmado(novo);
                    // Desenhar num tile pequeno da grade e inutil. Armar
                    // promove a tela ao palco; desarmar NAO desfixa, porque a
                    // pessoa costuma querer continuar vendo grande.
                    if (novo && !voice.isPinned(track)) voice.togglePin(track);
                  }}
                />
              </Show>
              {isScreenShare() ? (
                <ScreenShareAudioButton
                  userId={user().user!.id}
                  self={!!user().user!.self}
                  trackMuted={isScreenShareAudioMuted() || false}
                />
              ) : (
                <VoiceStatefulUserIcons
                  userId={participant.identity}
                  muted={isMuted()}
                  camera={isVideo()}
                />
              )}
            </Row>
          </OverlayInner>
        </Overlay>
      </div>
    </Show>
  );
}

/**
 * Destaca esta tela numa janela propria.
 *
 * A janela filha recebe o MESMO `MediaStream` por referencia viva, sem
 * reconectar no LiveKit — ver `components/rtc/popout.ts` para o porque de
 * nao fazer a janela entrar na sala sozinha.
 *
 * `stopPropagation` importa: o clique no tile alterna o pin
 * (`ParticipantTile` :79), e destacar nao deveria fixar de quebra.
 */
function BotaoDestacar(props: {
  track: TrackReferenceOrPlaceholder;
  nome: string;
}) {
  const { t } = useLingui();

  const sid = () => props.track.publication?.trackSid;
  const aberta = () => {
    const s = sid();
    return !!s && temPopout(s);
  };

  return (
    <Show when={popoutDisponivel() && sid()}>
      <button
        type="button"
        aria-label={aberta() ? t`Close detached window` : t`Detach to a window`}
        onClick={(e) => {
          e.stopPropagation();
          const s = sid();
          if (!s) return;
          if (aberta()) fecharPopout(s);
          else abrirPopout(props.track, props.nome);
        }}
        use:floating={{
          tooltip: {
            placement: "top",
            content: aberta()
              ? t`Close detached window`
              : t`Detach to a window`,
          },
        }}
        style={{
          background: "none",
          border: "none",
          padding: "0",
          cursor: "pointer",
          display: "flex",
          "align-items": "center",
          color: "inherit",
        }}
      >
        <Symbol size={16}>
          {aberta() ? "close_fullscreen" : "open_in_new"}
        </Symbol>
      </button>
    </Show>
  );
}

/**
 * Arma ou desarma o desenho (laser) sobre esta tela.
 *
 * Aparece so quando quem compartilha liberou. Armado, o canvas por cima do
 * video passa a receber o ponteiro; para sair, este mesmo botao ou Esc.
 *
 * Mesmo `stopPropagation` do `BotaoDestacar`, e pelo mesmo motivo.
 */
function BotaoDesenhar(props: { armado: boolean; aoAlternar: () => void }) {
  const { t } = useLingui();

  return (
    <button
      type="button"
      aria-label={props.armado ? t`Stop drawing` : t`Draw on this screen`}
      aria-pressed={props.armado}
      onClick={(e) => {
        e.stopPropagation();
        props.aoAlternar();
      }}
      use:floating={{
        tooltip: {
          placement: "top",
          content: props.armado
            ? t`Stop drawing (Esc)`
            : t`Draw on this screen`,
        },
      }}
      style={{
        background: "none",
        border: "none",
        padding: "0",
        cursor: "pointer",
        display: "flex",
        "align-items": "center",
        color: props.armado ? "var(--md-sys-color-primary)" : "inherit",
      }}
    >
      <Symbol size={16}>{props.armado ? "gesture" : "draw"}</Symbol>
    </button>
  );
}

/**
 * Mute / unmute a screen share's audio straight from its tile.
 *
 * Screen share audio arrives muted by default, and until now the only way to
 * hear it was through the user's context menu - painful when watching two
 * shares at once.
 */
function ScreenShareAudioButton(props: {
  userId: string;
  self: boolean;
  trackMuted: boolean;
}) {
  const state = useState();
  const { t } = useLingui();

  /** Muted by us (the only thing we can change here) */
  const mutedByUs = () =>
    !props.self && state.voice.getScreenShareMuted(props.userId);

  /** Nothing to listen to at all */
  const noAudio = () => props.trackMuted;

  return (
    <button
      type="button"
      class={audioButton()}
      disabled={noAudio() || props.self}
      onClick={(e) => {
        // never let this reach the tile's pin handler
        e.stopPropagation();
        if (props.self) return;
        state.voice.setScreenShareMuted(props.userId, !mutedByUs());
      }}
      use:floating={{
        tooltip: {
          placement: "top",
          content: noAudio()
            ? t`No audio shared`
            : mutedByUs()
              ? t`Unmute screen audio`
              : t`Mute screen audio`,
        },
      }}
    >
      <Symbol
        size={18}
        color={
          mutedByUs() && !noAudio() ? "var(--md-sys-color-error)" : undefined
        }
      >
        {noAudio() || mutedByUs() ? "no_sound" : "volume_up"}
      </Symbol>
    </button>
  );
}

const audioButton = cva({
  base: {
    display: "grid",
    placeItems: "center",
    padding: "2px",
    border: "none",
    borderRadius: "var(--borderRadius-full)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",

    _hover: {
      background: "#0003",
    },

    _disabled: {
      cursor: "default",
      opacity: 0.6,
      _hover: { background: "transparent" },
    },
  },
});

export const tile = cva({
  base: {
    display: "grid",
    aspectRatio: "16/9",
    transition: "outline-color .2s ease, background .2s ease",
    borderRadius: "var(--borderRadius-lg)",
    cursor: "pointer",

    color: "var(--md-sys-color-on-surface)",
    background: "#0002",

    overflow: "hidden",
    outlineWidth: "3px",
    outlineStyle: "solid",
    outlineOffset: "-3px",
    outlineColor: "transparent",
  },
  variants: {
    speaking: {
      true: {
        outlineColor: "var(--md-sys-color-primary)",
      },
    },
    /**
     * On the stage the tile fills its grid cell; the <video> inside keeps the
     * real aspect ratio via object-fit: contain.
     */
    stage: {
      true: {
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        aspectRatio: "auto",
      },
      false: {},
    },
    pinned: {
      true: {
        outlineColor: "var(--md-sys-color-tertiary)",
      },
      false: {},
    },
    video: {
      true: {},
    },
    fullscreen: {
      true: {},
    },
  },
  compoundVariants: [
    {
      speaking: [true],
      pinned: [true],
      css: {
        outlineColor: "var(--md-sys-color-primary)",
      },
    },
  ],
  defaultVariants: {
    stage: false,
    pinned: false,
  },
});

const AvatarOnly = styled("div", {
  base: {
    gridArea: "1/1",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",

    // TODO: Refactor the avatar component to be reactive later.
    "& > *": {
      width: "auto !important",
      height: "30% !important",
      minHeight: "48px",
    },
  },
});

const Overlay = styled("div", {
  base: {
    minWidth: 0,
    gridArea: "1/1",

    padding: "var(--gap-md) var(--gap-lg)",

    opacity: 1,
    display: "flex",
    alignItems: "end",
    flexDirection: "row",

    transition: "var(--transitions-fast) all",
    transitionTimingFunction: "ease",
  },
  variants: {
    showOnHover: {
      true: {
        opacity: 0,

        _groupHover: {
          opacity: 1,
        },
      },
      false: {
        opacity: 1,
      },
    },
  },
  defaultVariants: {
    showOnHover: false,
  },
});

const OverlayInner = styled("div", {
  base: {
    minWidth: 0,

    display: "flex",
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",

    _first: {
      flexGrow: 1,
    },
  },
});
