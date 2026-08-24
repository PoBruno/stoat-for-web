import { Match, Show, Switch } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { PublicChannelInvite } from "stoat.js";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { IS_DEV, podeCriarServidor, useClient } from "@revolt/client";
import { useInstance } from "@revolt/instance";
import { useModals } from "@revolt/modal";
import { useNavigate } from "@revolt/routing";
import { Button, CategoryButton, Header, iconSize, main } from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import MdAddCircle from "@material-design-icons/svg/filled/add_circle.svg?component-solid";
import MdExplore from "@material-design-icons/svg/filled/explore.svg?component-solid";
import MdGroups3 from "@material-design-icons/svg/filled/groups_3.svg?component-solid";
import MdHome from "@material-design-icons/svg/filled/home.svg?component-solid";
import MdPayments from "@material-design-icons/svg/filled/payments.svg?component-solid";
import MdRateReview from "@material-design-icons/svg/filled/rate_review.svg?component-solid";
import MdSettings from "@material-design-icons/svg/filled/settings.svg?component-solid";

import { HeaderIcon } from "./common/CommonHeader";
import { AmigosOnline } from "./home/AmigosOnline";
import { Timeline } from "./home/Timeline";

/**
 * Base layout of the home page (i.e. the header/background)
 */
const Base = styled("div", {
  base: {
    width: "100%",
    display: "flex",
    flexDirection: "column",

    color: "var(--md-sys-color-on-surface)",
  },
});

/**
 * Layout of the content as a whole
 *
 * Encostado no topo e à esquerda. Quando a Home era um punhado de botões,
 * centralizar fazia sentido; com um feed, centralizar empurra o conteúdo
 * para baixo da dobra e deixa uma faixa vazia à esquerda.
 */
const content = cva({
  base: {
    ...main.raw(),

    padding: "var(--gap-lg) var(--gap-lg) var(--gap-xl)",

    gap: "var(--gap-lg)",
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
});

/**
 * Duas colunas: o feed ocupa a maior parte, os atalhos ficam ao lado.
 *
 * Em tela estreita vira uma coluna só, com os atalhos abaixo do feed — o
 * que interessa é o conteúdo, não os botões.
 */
const Painel = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-lg)",
    width: "100%",
    // Sem `margin: auto` e sem largura fixa: o painel acompanha a janela em
    // vez de virar uma coluna estreita no meio de espaço vazio.
    alignItems: "flex-start",

    "@media (max-width: 820px)": {
      flexDirection: "column",
    },
  },
});

const Lateral = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    width: "260px",
    flexShrink: 0,

    "@media (max-width: 820px)": {
      width: "100%",
    },
  },
});

const Atalhos = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-xs)",
    borderRadius: "var(--borderRadius-xl)",
    overflow: "hidden",
  },
});

/**
 * Home page
 */
export function HomePage() {
  const { openModal } = useModals();
  const navigate = useNavigate();
  const client = useClient();
  const instance = useInstance();

  // check if we're stoat.chat; if so, check if the user is in the Lounge
  const showLoungeButton = instance.isStoat;
  const isInLounge =
    client()!.servers.get("01F7ZSBSFHQ8TA81725KQCSDDP") !== undefined;

  // A instância pode restringir a criação de servidores a alguns usuários.
  const criarServidor = () => podeCriarServidor(client());

  return (
    <Base>
      <Header placement="primary">
        <HeaderIcon>
          <MdHome {...iconSize(22)} />
        </HeaderIcon>
        <Trans>Home</Trans>
      </Header>
      <div use:scrollable={{ class: content() }}>
        {/*
          O wordmark centralizado saiu daqui: ele ocupava a primeira dobra
          inteira para repetir o que o cabeçalho logo acima já diz, e
          empurrava o feed para fora da tela.

          Duas colunas: o feed ocupa a maior parte e os atalhos ficam ao
          lado. Antes a Home era só um punhado de botões — nada aqui dizia
          se algo tinha acontecido desde a última visita.
        */}
        <Painel>
          <Timeline />
          <Lateral>
            <AmigosOnline />
            <Atalhos>
              <CategoryButton
                onClick={() =>
                  openModal({
                    type: "create_group_or_server",
                    client: client()!,
                  })
                }
                description={
                  <Trans>
                    Invite all of your friends, some cool bots, and throw a big
                    party.
                  </Trans>
                }
                icon={<MdAddCircle />}
              >
                <Show
                  when={criarServidor()}
                  fallback={<Trans>Create a group</Trans>}
                >
                  <Trans>Create a group or server</Trans>
                </Show>
              </CategoryButton>
              <Switch fallback={null}>
                <Match when={showLoungeButton && isInLounge}>
                  <CategoryButton
                    onClick={() =>
                      navigate("/server/01F7ZSBSFHQ8TA81725KQCSDDP")
                    }
                    description={
                      <Trans>
                        You can report issues and discuss improvements with us
                        directly here.
                      </Trans>
                    }
                    icon={<MdGroups3 />}
                  >
                    <Trans>Go to the Stoat Lounge</Trans>
                  </CategoryButton>
                </Match>
                <Match when={showLoungeButton && !isInLounge}>
                  <CategoryButton
                    onClick={() => {
                      client()
                        .api.get("/invites/Testers")
                        .then((invite) =>
                          PublicChannelInvite.from(client(), invite),
                        )
                        .then((invite) =>
                          openModal({ type: "invite", invite }),
                        );
                    }}
                    description={
                      <Trans>
                        You can report issues and discuss improvements with us
                        directly here.
                      </Trans>
                    }
                    icon={<MdGroups3 />}
                  >
                    <Trans>Join the Stoat Lounge</Trans>
                  </CategoryButton>
                </Match>
              </Switch>
              {/*
              Doação e feedback vão para o ko-fi e as discussions do projeto
              oficial. Numa instância própria isso manda o usuário para fora,
              para um lugar que não tem relação com quem hospeda — mesmo
              motivo pelo qual "Discover" já era condicionado a `isStoat`.
            */}
              <Show when={instance.isStoat}>
                <CategoryButton
                  variant="tertiary"
                  onClick={() => window.open("https://ko-fi.com/stoatchat")}
                  description={
                    <Trans>Support the project by donating - thank you!</Trans>
                  }
                  icon={<MdPayments />}
                >
                  <Trans>Donate to Stoat</Trans>
                </CategoryButton>
              </Show>
              <Show when={instance.isStoat}>
                <CategoryButton
                  onClick={() => navigate("/discover")}
                  description={
                    <Trans>
                      Find a community based on your hobbies or interests.
                    </Trans>
                  }
                  icon={<MdExplore />}
                >
                  <Trans>Discover Stoat</Trans>
                </CategoryButton>
              </Show>
              <Show when={instance.isStoat}>
                <CategoryButton
                  onClick={() =>
                    openModal({
                      type: "settings",
                      config: "user",
                      context: { page: "feedback" },
                    })
                  }
                  description={
                    <Trans>
                      Let us know how we can improve our app by giving us
                      feedback.
                    </Trans>
                  }
                  icon={<MdRateReview {...iconSize(22)} />}
                >
                  <Trans>Give feedback on Stoat</Trans>
                </CategoryButton>
              </Show>
              <CategoryButton
                onClick={() =>
                  openModal({
                    type: "settings",
                    config: "user",
                    context: { page: "download" },
                  })
                }
                description={<Trans>Instale o Stoat no seu computador.</Trans>}
                icon={<Symbol size={22}>install_desktop</Symbol>}
              >
                <Trans>Baixar aplicativo</Trans>
              </CategoryButton>
              <CategoryButton
                onClick={() => openModal({ type: "settings", config: "user" })}
                description={
                  <Trans>
                    You can also click the gear icon in the bottom left.
                  </Trans>
                }
                icon={<MdSettings />}
              >
                <Trans>Open settings</Trans>
              </CategoryButton>
            </Atalhos>
            {/*
              Página interna do próprio projeto, para testar componentes.
              Só existe em build de desenvolvimento (`IS_DEV`) — em produção
              nem chega a ser compilada. Fica no rodapé da lateral em vez de
              solta no meio da tela.
            */}
            <Show when={IS_DEV}>
              <Button variant="text" onPress={() => navigate("/dev")}>
                Open Development Page
              </Button>
            </Show>
          </Lateral>
        </Painel>
      </div>
    </Base>
  );
}
