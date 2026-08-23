import { createSignal } from "solid-js";

import type { Client } from "stoat.js";

/** Types we can show a thumbnail for before upload */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export type PendingFile = {
  /** Local id, only meaningful before upload */
  id: string;
  file: File;
  /** Object URL for the thumbnail, images only */
  dataUri?: string;
  /** Set once the file is on the media server */
  autumnId?: string;
};

/**
 * Files staged for a forum post or comment.
 *
 * Kept out of the global Draft store: a draft is keyed by channel and assumes
 * a message stream, which a forum does not have. The lifetime here is the
 * composer, so a plain signal is enough.
 */
export function createAttachments(limits: {
  maxSize: () => number;
  maxCount: () => number;
}) {
  const [files, setFiles] = createSignal<PendingFile[]>([]);

  return {
    files,

    /** Whether more files can still be attached */
    canAdd: () => files().length < limits.maxCount(),

    /**
     * Stage files, rejecting anything too large or over the count limit.
     * @returns names of the files that were rejected
     */
    add(incoming: File[]): string[] {
      const rejected: string[] = [];
      const accepted: PendingFile[] = [];
      let room = limits.maxCount() - files().length;

      for (const file of incoming) {
        if (room <= 0 || file.size > limits.maxSize()) {
          rejected.push(file.name);
          continue;
        }
        room--;
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          dataUri: IMAGE_TYPES.includes(file.type)
            ? URL.createObjectURL(file)
            : undefined,
        });
      }

      if (accepted.length) setFiles((current) => [...current, ...accepted]);
      return rejected;
    },

    /** Drop a staged file, releasing its object URL */
    remove(id: string) {
      setFiles((current) => {
        const going = current.find((f) => f.id === id);
        if (going?.dataUri) URL.revokeObjectURL(going.dataUri);
        return current.filter((f) => f.id !== id);
      });
    },

    /** Release every object URL and empty the list */
    clear() {
      for (const f of files()) {
        if (f.dataUri) URL.revokeObjectURL(f.dataUri);
      }
      setFiles([]);
    },

    /**
     * Upload anything not yet uploaded and return the media server ids.
     *
     * Ids are cached on the entry so a failed submit followed by a retry does
     * not upload the same bytes twice.
     */
    async upload(client: Client, mediaUrl: string): Promise<string[]> {
      const ids: string[] = [];

      for (const entry of files()) {
        if (entry.autumnId) {
          ids.push(entry.autumnId);
          continue;
        }

        const id = await client.uploadFile("attachments", entry.file, mediaUrl);
        setFiles((current) =>
          current.map((f) => (f.id === entry.id ? { ...f, autumnId: id } : f)),
        );
        ids.push(id);
      }

      return ids;
    },
  };
}

export type Attachments = ReturnType<typeof createAttachments>;
