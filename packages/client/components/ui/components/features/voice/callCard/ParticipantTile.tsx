import { Show } from "solid-js";
import {
  TrackReference,
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
        class={
          tile({
            speaking: !isScreenShare() && isSpeaking(),
            video: isVideo() || isScreenShare(),
            fullscreen: voice.fullscreen(),
            pinned: voice.isPinned(track),
            stage: props.stage,
          }) + (isScreenShare() ? " vc_tile group" : " vc_tile")
        }
        onClick={() => voice.togglePin(track)}
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
        <Overlay showOnHover={isScreenShare()}>
          <OverlayInner>
            <OverflowingText>{user().username}</OverflowingText>
            <Row gap="md">
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
