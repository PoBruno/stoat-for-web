import { createFormControl, createFormGroup } from "solid-forms";
import { For, Match, Show, Switch, createResource } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { Server } from "stoat.js";

import { useClient } from "@revolt/client";
import { useError } from "@revolt/i18n";
import { useInstance } from "@revolt/instance";
import { useModals } from "@revolt/modal";
import {
  CategoryButton,
  CircularProgress,
  Column,
  Form2,
  Row,
  Symbol,
  Text,
} from "@revolt/ui";

/**
 * Soundboard settings for a server: upload and manage sounds.
 */
export function SoundList(props: { server: Server }) {
  const err = useError();
  const { t } = useLingui();
  const client = useClient();
  const { openModal, showError } = useModals();
  const instance = useInstance();

  // Uma busca ao abrir; depois os eventos mantem a colecao viva.
  const [carregou] = createResource(
    () => props.server.id,
    // Roda dentro do createResource, disparado pela fonte acima; o lint nao
    // enxerga isso como escopo rastreado.
    // eslint-disable-next-line solid/reactivity
    async () => {
      try {
        await props.server.fetchSounds();
      } catch (error) {
        showError(error);
      }
      return true;
    },
  );

  function isDisabled() {
    return props.server.sounds.length >= instance.globalLimits.server_sounds;
  }

  const editGroup = createFormGroup(
    {
      name: createFormControl("", { required: true }),
      category: createFormControl(""),
      file: createFormControl<string | File[] | null>(null, { required: true }),
    },
    { disabled: isDisabled() },
  );

  async function onSubmit() {
    const arquivo = (editGroup.controls.file.value as File[])[0];

    // A duracao e medida aqui, no browser, porque o backend nao decodifica
    // audio: guardar o numero pronto evita o painel ter que baixar todos os
    // clipes so para mostrar "00:02".
    const duracao = await medirDuracao(arquivo).catch(() => undefined);

    const body = new FormData();
    body.append("file", arquivo);

    const [key, value] = client().authenticationHeader;
    const data: { id: string } = await fetch(`${instance.mediaUrl}/sounds`, {
      method: "POST",
      body,
      headers: { [key]: value },
    }).then((res) => res.json());

    await props.server.createSound(data.id, {
      name: editGroup.controls.name.value,
      category: editGroup.controls.category.value || undefined,
      duration: duracao,
    });
  }

  function onReset() {
    editGroup.controls.name.setValue("");
    editGroup.controls.category.setValue("");
    editGroup.controls.file.setValue(null);
  }

  const submit = Form2.useSubmitHandler(editGroup, onSubmit, onReset);

  return (
    <Column gap="lg">
      <form onSubmit={submit}>
        <Column>
          <Row align>
            <Column>
              <Form2.FileInput
                control={editGroup.controls.file}
                accept="audio/*"
                imageJustify={false}
                allowRemoval={false}
                maxSize={instance.limits().file_upload_size_limits["sounds"]}
                hideErrors={true}
              />
            </Column>
            <Column grow>
              <Form2.TextField
                minlength={1}
                maxlength={32}
                counter
                name="name"
                control={editGroup.controls.name}
                label={t`Sound name`}
                autocomplete="off"
              />
              <Form2.TextField
                maxlength={32}
                name="category"
                control={editGroup.controls.category}
                label={t`Category`}
                helper={t`Free text. Sounds sharing a category are grouped together.`}
                helper-on-focus={true}
                autocomplete="off"
              />

              <Row align>
                <Form2.Submit group={editGroup}>
                  <Trans>Create</Trans>
                </Form2.Submit>
                <Switch
                  fallback={
                    <Trans>
                      {instance.globalLimits.server_sounds -
                        props.server.sounds.length}{" "}
                      sound slots remaining
                    </Trans>
                  }
                >
                  <Match when={editGroup.errors?.error}>
                    {err(editGroup.errors!.error)}
                  </Match>
                  <Match when={editGroup.isPending}>
                    <CircularProgress />
                  </Match>
                </Switch>
              </Row>
            </Column>
          </Row>
        </Column>
      </form>

      <Column gap="sm">
        <Show
          when={carregou()}
          fallback={
            <Text class="label" size="small">
              <Trans>Loading sounds.</Trans>
            </Text>
          }
        >
          <Show
            when={props.server.sounds.length}
            fallback={
              <Text class="label" size="small">
                <Trans>No sounds on this server yet.</Trans>
              </Text>
            }
          >
            <For
              each={props.server.sounds.toSorted((b, a) =>
                a.id.localeCompare(b.id),
              )}
            >
              {(sound) => (
                <CategoryButton
                  roundedIcon={false}
                  icon={<Symbol>music_note</Symbol>}
                  onClick={() => openModal({ type: "delete_sound", sound })}
                  description={
                    <Show when={sound.category} fallback={t`Uncategorised`}>
                      {sound.category}
                    </Show>
                  }
                >
                  {sound.name}
                </CategoryButton>
              )}
            </For>
          </Show>
        </Show>
      </Column>
    </Column>
  );
}

/**
 * Read how long an audio file plays for.
 *
 * Uses an <audio> element rather than decoding through WebAudio: decoding a
 * whole file just to read its length would allocate the entire PCM buffer.
 */
function medirDuracao(arquivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const audio = new Audio();

    const limpar = () => URL.revokeObjectURL(url);

    audio.addEventListener("loadedmetadata", () => {
      limpar();
      // Streams sem duracao conhecida devolvem Infinity.
      if (Number.isFinite(audio.duration)) {
        resolve(Math.round(audio.duration * 1000));
      } else {
        reject(new Error("duracao desconhecida"));
      }
    });
    audio.addEventListener("error", () => {
      limpar();
      reject(new Error("nao consegui ler o audio"));
    });

    audio.src = url;
  });
}
