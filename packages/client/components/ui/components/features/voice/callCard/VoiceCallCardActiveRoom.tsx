import { useLingui } from "@lingui/solid/macro";
import { createResizeObserver } from "@solid-primitives/resize-observer";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { TrackLoop } from "solid-livekit-components";
import { styled } from "styled-system/jsx";

import { InRoom, useVoice } from "@revolt/rtc";
import { useState } from "@revolt/state";
import type { CallArrangement } from "@revolt/state/stores/Voice";
import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";
import { scrollableStyles } from "@revolt/ui/directives";

import { ParticipantTile, tile } from "./ParticipantTile";
import { VoiceCallCardActions } from "./VoiceCallCardActions";
import { VoiceCallCardStatus } from "./VoiceCallCardStatus";
import { ContextMenu } from "../../../../../app/menus/ContextMenu";
import { VolumeMusicBox } from "../../../../../../src/interface/channels/voice/musicbox/VolumeMusicBox";

/**
 * Call card (active)
 */
export function VoiceCallCardActiveRoom() {
  return (
    <View>
      <Participants />
      <VoiceCallControls>
        <VoiceCallControlHolder right>
          <VoiceCallArrangement />
          <VoiceCallSoundboardToggle />
          <VoiceCallMusicBoxToggle />
          <VoiceCallChatToggle />
          <VoiceCallFullscreen />
        </VoiceCallControlHolder>
        <VoiceCallCardActions size="sm" />
        <VoiceCallControlHolder left overflow>
          <VoiceCallCardStatus />
        </VoiceCallControlHolder>
      </VoiceCallControls>
    </View>
  );
}

/** Icon shown for each arrangement */
const ARRANGEMENT_ICON: Record<CallArrangement, string> = {
  auto: "auto_awesome_mosaic",
  columns: "splitscreen_right",
  rows: "splitscreen_bottom",
  grid: "grid_view",
  primary: "view_sidebar",
};

/**
 * Cycle through the stage arrangements
 */
function VoiceCallArrangement() {
  const voice = useVoice();
  const state = useState();
  const { t } = useLingui();

  const order: CallArrangement[] = [
    "auto",
    "columns",
    "rows",
    "grid",
    "primary",
  ];

  const label = () => {
    switch (state.voice.callArrangement) {
      case "columns":
        return t`Layout: side by side`;
      case "rows":
        return t`Layout: stacked`;
      case "grid":
        return t`Layout: grid`;
      case "primary":
        return t`Layout: one large`;
      default:
        return t`Layout: automatic`;
    }
  };

  return (
    <Show when={voice.vidTracks().length > 1}>
      <IconButton
        size="sm"
        variant={"standard"}
        onPress={() => {
          const i = order.indexOf(state.voice.callArrangement);
          state.voice.callArrangement = order[(i + 1) % order.length];
        }}
        use:floating={{
          tooltip: { placement: "top", content: label() },
        }}
      >
        <Symbol>{ARRANGEMENT_ICON[state.voice.callArrangement]}</Symbol>
      </IconButton>
    </Show>
  );
}

/**
 * Open or close the soundboard panel
 */
function VoiceCallSoundboardToggle() {
  const voice = useVoice();
  const { t } = useLingui();

  return (
    <IconButton
      size="sm"
      variant={voice.soundboardOpen() ? "tonal" : "standard"}
      onPress={() => voice.toggleSoundboard()}
      isDisabled={!voice.soundboardPermission}
      use:floating={{
        tooltip: {
          placement: "top",
          content: voice.soundboardPermission
            ? t`Soundboard`
            : t`Missing permission`,
        },
      }}
    >
      <Symbol>graphic_eq</Symbol>
    </IconButton>
  );
}

/**
 * Open or close the MusicBox panel
 */
function VoiceCallMusicBoxToggle() {
  const voice = useVoice();
  const { t } = useLingui();

  return (
    <IconButton
      size="sm"
      variant={voice.musicboxOpen() ? "tonal" : "standard"}
      onPress={() => voice.toggleMusicbox()}
      isDisabled={!voice.musicboxPermission}
      use:floating={{
        tooltip: {
          placement: "top",
          content: voice.musicboxPermission
            ? t`MusicBox`
            : t`Missing permission`,
        },
        // Botao direito abre o volume, igual ao soundboard na barra lateral.
        contextMenu: () => (
          <ContextMenu>
            <VolumeMusicBox channelId={voice.channel()?.id ?? ""} />
          </ContextMenu>
        ),
      }}
    >
      <Symbol>music_note</Symbol>
    </IconButton>
  );
}

/**
 * Show or hide the text chat underneath the call
 */
function VoiceCallChatToggle() {
  const state = useState();
  const { t } = useLingui();

  return (
    <IconButton
      size="sm"
      variant={"standard"}
      onPress={() => state.voice.toggleCallChat()}
      use:floating={{
        tooltip: {
          placement: "top",
          content: state.voice.showCallChat ? t`Hide chat` : t`Show chat`,
        },
      }}
    >
      <Show
        when={state.voice.showCallChat}
        fallback={<Symbol>chat_bubble</Symbol>}
      >
        <Symbol>speaker_notes_off</Symbol>
      </Show>
    </IconButton>
  );
}

function VoiceCallFullscreen() {
  const voice = useVoice();
  return (
    <IconButton
      size="sm"
      variant={"standard"}
      onPress={() => voice.toggleFullscreen()}
    >
      <Show when={voice.fullscreen()} fallback={<Symbol>fullscreen</Symbol>}>
        <Symbol>fullscreen_exit</Symbol>
      </Show>
    </IconButton>
  );
}

const TILE_MIN_WIDTH = "250px",
  FILMSTRIP_MIN_HEIGHT = "100px";

/**
 * Decide how many columns the stage should use.
 *
 * `count` tiles inside a box of `aspect` (width / height).
 */
function stageColumns(
  count: number,
  arrangement: CallArrangement,
  aspect: number,
): number {
  if (count <= 1) return 1;

  switch (arrangement) {
    case "columns":
      return count;
    case "rows":
      return 1;
    case "grid":
      return Math.ceil(Math.sqrt(count));
    case "primary":
      // handled with explicit grid areas, not a uniform column count
      return 1;
    case "auto":
    default: {
      // Maximise the area actually covered by 16:9 video once letterboxing is
      // taken into account, rather than just aiming for square-ish cells.
      const TARGET = 16 / 9;
      const areaFor = (cols: number) => {
        const rows = Math.ceil(count / cols);
        // cell size in arbitrary units for a box of width `aspect`, height 1
        const cw = aspect / cols;
        const ch = 1 / rows;
        // a 16:9 rect fitted inside the cell
        return cw / ch > TARGET ? ch * ch * TARGET : (cw * cw) / TARGET;
      };

      let bestArea = 0;
      for (let cols = 1; cols <= count; cols++) {
        bestArea = Math.max(bestArea, areaFor(cols));
      }

      // Among the layouts that are within a few percent of optimal, take the
      // widest one. Side by side reads better than stacked and is what people
      // expect for two screen shares, even when stacking wins on raw pixels.
      const TOLERANCE = 0.85;
      let best = 1;
      for (let cols = 1; cols <= count; cols++) {
        if (areaFor(cols) >= bestArea * TOLERANCE) best = cols;
      }
      return best;
    }
  }
}

/**
 * Show the stage (pinned tiles) and the filmstrip (everyone else)
 */
function Participants() {
  const voice = useVoice();
  const state = useState();
  const { t } = useLingui();

  // Dev affordance: `?tiles=6` adds placeholder tiles and `?arrangement=columns`
  // forces a layout, so arrangements can be checked without gathering that
  // many real participants.
  const devParams = import.meta.env.DEV
    ? new URLSearchParams(location.search)
    : undefined;

  const testTrackCount = Math.min(
    24,
    Math.max(0, parseInt(devParams?.get("tiles") ?? "0", 10) || 0),
  );

  const devArrangement = devParams?.get("arrangement") as
    | CallArrangement
    | undefined;

  let callRef: HTMLDivElement | undefined;

  /**
   * Shape of the area the tiles actually live in.
   *
   * Measured on the stage, not the whole call: the filmstrip eats a chunk of
   * the height and would otherwise skew the arrangement towards stacking.
   * Kept in a signal because reading element.style is not reactive.
   */
  const [stageBox, setStageBox] = createSignal({ w: 0, h: 0 });

  const aspect = () => {
    const { w, h } = stageBox();
    return h > 0 ? w / h : 16 / 9;
  };

  /** Attach a ResizeObserver as soon as the stage element exists */
  function observeStage(el: HTMLDivElement) {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setStageBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  }

  /**
   * Tiles shown on the stage.
   *
   * Falls back to everyone when nothing is pinned - and also when the pins no
   * longer resolve to a live track, so a stale pin can never blank the stage.
   */
  const stageTracks = () => {
    const pinned = voice.pinnedTracks();
    return pinned.length ? pinned : voice.vidTracks();
  };

  /** Tiles shown in the filmstrip */
  const stripTracks = () =>
    voice.pinnedTracks().length ? voice.unpinnedTracks() : [];

  const hasStrip = () =>
    stripTracks().length > 0 && state.voice.callFilmstrip !== "hidden";

  const arrangement = (): CallArrangement =>
    devArrangement ?? state.voice.callArrangement;

  const columns = createMemo(() =>
    stageColumns(
      stageTracks().length + testTrackCount,
      arrangement(),
      aspect(),
    ),
  );

  // Drop pins whose track disappeared (participant left, share stopped, ...)
  createEffect(() => {
    voice.vidTracks();
    voice.prunePins();
  });

  onMount(() => {
    createResizeObserver(callRef, ({ width, height }, el) => {
      if (el === callRef) {
        el.style.setProperty("--vc-w", `${width}px`);
        el.style.setProperty("--vc-h", `${height}px`);
      }
    });
  });

  return (
    <Call
      ref={callRef}
      side={hasStrip() && state.voice.callFilmstrip === "side"}
      data-pins={import.meta.env.DEV ? voice.pinnedIds().join(",") : undefined}
      data-tracks={
        import.meta.env.DEV
          ? voice
              .vidTracks()
              .map((t) => voice.trackId(t))
              .join(",")
          : undefined
      }
      data-stage={import.meta.env.DEV ? stageTracks().length : undefined}
      data-strip={import.meta.env.DEV ? stripTracks().length : undefined}
      data-cols={import.meta.env.DEV ? columns() : undefined}
      data-aspect={import.meta.env.DEV ? aspect().toFixed(3) : undefined}
      data-arr={import.meta.env.DEV ? arrangement() : undefined}
    >
      <InRoom>
        <Stage
          ref={observeStage}
          primary={arrangement() === "primary"}
          style={
            arrangement() === "primary"
              ? {
                  // `grid-row: 1 / -1` on the primary tile only resolves
                  // against explicit rows, so declare one per secondary tile.
                  "grid-template-rows": `repeat(${Math.max(
                    1,
                    stageTracks().length + testTrackCount - 1,
                  )}, minmax(0, 1fr))`,
                }
              : {
                  "grid-template-columns": `repeat(${columns()}, minmax(0, 1fr))`,
                }
          }
        >
          <TrackLoop tracks={stageTracks}>
            {() => <ParticipantTile stage />}
          </TrackLoop>
          <For each={Array(testTrackCount)}>
            {(_, i) => (
              <div
                class={tile({ stage: true, video: true }) + " vc_tile"}
                style={{
                  display: "grid",
                  "place-items": "center",
                  color: "var(--md-sys-color-on-surface-variant)",
                }}
              >
                {i() + 1}
              </div>
            )}
          </For>
        </Stage>

        <Show when={hasStrip()}>
          <Filmstrip
            side={state.voice.callFilmstrip === "side"}
            class={scrollableStyles({
              direction: state.voice.callFilmstrip === "side" ? "y" : "x",
            })}
          >
            <TrackLoop tracks={stripTracks}>
              {() => <ParticipantTile />}
            </TrackLoop>
          </Filmstrip>
        </Show>

        <Show when={voice.pinnedTracks().length > 0}>
          <StripControls>
            <IconButton
              size="xs"
              variant={"tonal"}
              onPress={() =>
                (state.voice.callFilmstrip =
                  state.voice.callFilmstrip === "bottom"
                    ? "side"
                    : state.voice.callFilmstrip === "side"
                      ? "hidden"
                      : "bottom")
              }
              use:floating={{
                tooltip: {
                  placement: "top",
                  content:
                    state.voice.callFilmstrip === "bottom"
                      ? t`Others: bottom`
                      : state.voice.callFilmstrip === "side"
                        ? t`Others: side`
                        : t`Others: hidden`,
                },
              }}
            >
              <Show
                when={state.voice.callFilmstrip !== "hidden"}
                fallback={<Symbol>bottom_panel_open</Symbol>}
              >
                <Symbol>bottom_panel_close</Symbol>
              </Show>
            </IconButton>
            <IconButton
              size="xs"
              variant={"tonal"}
              onPress={() => voice.clearPins()}
              use:floating={{
                tooltip: { placement: "top", content: t`Unpin all` },
              }}
            >
              <Symbol>close_fullscreen</Symbol>
            </IconButton>
          </StripControls>
        </Show>
      </InRoom>
    </Call>
  );
}

const View = styled("div", {
  base: {
    minHeight: 0,
    height: "100%",
    width: "100%",

    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
  },
});

const VoiceCallControls = styled("div", {
  base: {
    display: "flex",
    flexShrink: "0",
    overflow: "hidden",
    flexDirection: "row-reverse",
  },
});

const VoiceCallControlHolder = styled("div", {
  base: {
    display: "flex",
    flex: "1",
    alignSelf: "center",
    gap: "var(--gap-md)",
    padding: "var(--gap-md)",
  },
  variants: {
    right: {
      true: {
        justifyContent: "flex-end",
      },
    },
    empty: {
      true: {
        gap: "0px",
        padding: "0px",
      },
    },
    left: {
      true: {
        justifyContent: "flex-start",
      },
    },
    overflow: {
      true: {
        overflow: "hidden",
      },
    },
  },
});

const StripControls = styled("div", {
  base: {
    position: "absolute",
    top: "var(--gap-sm)",
    right: "var(--gap-sm)",
    zIndex: 2,

    display: "flex",
    flexDirection: "row",
    gap: "var(--gap-sm)",
  },
});

const Call = styled("div", {
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
    flexGrow: 1,
    minHeight: 0,
  },
  variants: {
    side: {
      true: {
        flexDirection: "row",
      },
    },
  },
});

/** Pinned tiles - fills all remaining space */
const Stage = styled("div", {
  base: {
    display: "grid",
    gap: "var(--gap-md)",
    flexGrow: 1,
    minHeight: 0,
    minWidth: 0,
    placeItems: "stretch",
    gridAutoRows: "minmax(0, 1fr)",
    transition: "grid-template-columns .25s ease, grid-template-rows .25s ease",
  },
  variants: {
    primary: {
      true: {
        // first tile takes the whole left side, the rest stack on the right
        gridTemplateColumns: "minmax(0, 3fr) minmax(0, 1fr)",
        gridAutoFlow: "row",

        "& > *:first-child": {
          gridColumn: 1,
          gridRow: "1 / -1",
        },
      },
    },
  },
});

/** Non-pinned tiles */
const Filmstrip = styled("div", {
  base: {
    display: "flex",
    flexShrink: 0,
    gap: "var(--gap-md)",
    justifyContent: "safe center",
    alignItems: "center",
    transition: "height .3s ease, width .3s ease",

    "& .vc_tile": {
      flexShrink: 0,
    },
  },
  variants: {
    side: {
      true: {
        flexDirection: "column",
        width: `max(18%, ${TILE_MIN_WIDTH})`,
        maxWidth: "30%",
        height: "auto",
        overflowY: "auto",

        "& .vc_tile": {
          width: "100%",
          height: "auto",
        },
      },
      false: {
        flexDirection: "row",
        height: `max(18%, ${FILMSTRIP_MIN_HEIGHT})`,
        width: "100%",
        overflowX: "auto",

        "& .vc_tile": {
          height: "100%",
          width: "auto",
        },
      },
    },
  },
});
