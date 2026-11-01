import { useEffect, useRef, useState } from "react";
import {
  ClipboardCopy,
  ClipboardPaste,
  Download,
  FileUp,
  HardDriveDownload,
  Share2,
} from "lucide-react";
import { Confirm } from "@/components/game/Confirm";
import {
  backupFileName,
  collect,
  deviceStore,
  parseBackup,
  stageRestore,
  summary,
  type Backup,
} from "@/game/backup";
import { flashToast, saveAllNow } from "@/game/engine";

/** On the phone app, rather than in a browser. */
async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Every save on this device, written out now, as the text of a backup file. */
function makeBackup(): { json: string; backup: Backup } | null {
  saveAllNow();
  const store = deviceStore();
  if (!store) return null;
  const backup = collect(store, Date.now());
  return { json: JSON.stringify(backup), backup };
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function when(at: number): string {
  if (!at) return "an unknown date";
  return new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Options → Backup: everything this game keeps on the device in one file
 * (options, texts, skills, the Court, Reps and their history, chess, tower
 * defense, advanced settings, the narrator), to send to another phone and load
 * there. Loading replaces what is on this device, after asking, and restarts.
 */
export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [native, setNative] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void isNative().then((n) => live && setNative(n));
    return () => {
      live = false;
    };
  }, []);

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await job();
    } finally {
      setBusy(false);
    }
  };

  /** Phone app: the share sheet (Quick Share, Drive, a chat with yourself, …). */
  const share = () =>
    run(async () => {
      const made = makeBackup();
      if (!made) return setError("This device keeps no saves to back up.");
      const name = backupFileName(made.backup.exportedAt);
      try {
        const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const file = await Filesystem.writeFile({
          path: name,
          data: made.json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({ title: name, dialogTitle: "Send the backup", files: [file.uri] });
      } catch (e) {
        // Closing the share sheet without picking anything is not an error.
        if (!/cancel/i.test(String((e as Error)?.message ?? e)))
          setError("Could not share the file. Try Save to Documents, or Copy as text.");
      }
    });

  /** Phone app: a file in the phone's Documents folder. */
  const saveToDocuments = () =>
    run(async () => {
      const made = makeBackup();
      if (!made) return setError("This device keeps no saves to back up.");
      const name = backupFileName(made.backup.exportedAt);
      try {
        const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
        await Filesystem.writeFile({
          path: name,
          data: made.json,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        flashToast(`Saved: Documents/${name}`);
      } catch {
        setError("Could not save to Documents on this phone. Use Share instead.");
      }
    });

  /** Browser: a download. */
  const download = () =>
    run(async () => {
      const made = makeBackup();
      if (!made) return setError("This device keeps no saves to back up.");
      const url = URL.createObjectURL(new Blob([made.json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName(made.backup.exportedAt);
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      flashToast("Backup saved");
    });

  const copy = () =>
    run(async () => {
      const made = makeBackup();
      if (!made) return setError("This device keeps no saves to back up.");
      try {
        const { Clipboard } = await import("@capacitor/clipboard");
        await Clipboard.write({ string: made.json });
      } catch {
        try {
          await navigator.clipboard.writeText(made.json);
        } catch {
          return setError("Could not copy. Use the file instead.");
        }
      }
      flashToast(`Backup copied (${size(made.json.length)})`);
    });

  /** Reads a backup and asks before using it. */
  const consider = (text: string) => {
    const r = parseBackup(text);
    if (!r.ok) {
      setPending(null);
      setError(r.error);
      return;
    }
    setError("");
    setPending(r.backup);
  };

  const pasteBackup = () =>
    run(async () => {
      let text = "";
      try {
        const { Clipboard } = await import("@capacitor/clipboard");
        text = (await Clipboard.read()).value ?? "";
      } catch {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          text = "";
        }
      }
      if (!text.trim()) return setError("Nothing to paste. Copy a backup's text first.");
      consider(text);
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      consider(await file.text());
    } catch {
      setError("Could not read that file.");
    }
  };

  const restore = (b: Backup) => {
    const store = deviceStore();
    if (!store) return setError("This device cannot keep saves.");
    try {
      stageRestore(store, b);
    } catch {
      return setError("Not enough room on this device to load the backup.");
    }
    // The saves are replaced as the game starts again, before anything reads them.
    window.location.reload();
  };

  const shown = pending ? summary(pending) : null;

  return (
    <div className="mt-3">
      <p className="text-sm text-fg">
        Everything in one file: options, loaded texts, skills and best scores, the Court, Reps and
        their history, chess, tower defense, advanced settings and the narrator.
      </p>
      <p className="mt-1 text-xs text-muted">
        To move to another phone: save or send the file, install the app there, then load the file
        in Options → Backup. If you set a narrator API key, it is in the file too, so send it only
        to yourself.
      </p>

      <h3 className="mt-4 font-display text-xs tracking-[0.16em] text-violet uppercase">
        Save a backup
      </h3>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {native ? (
          <>
            <button type="button" className="btn btn-gold min-h-12" disabled={busy} onClick={share}>
              <Share2 className="size-4" aria-hidden />
              Share file
            </button>
            <button
              type="button"
              className="btn min-h-12"
              disabled={busy}
              onClick={saveToDocuments}
            >
              <HardDriveDownload className="size-4" aria-hidden />
              Save to Documents
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-gold min-h-12"
            disabled={busy}
            onClick={download}
          >
            <Download className="size-4" aria-hidden />
            Save file
          </button>
        )}
        <button
          type="button"
          className={`btn min-h-12 ${native ? "col-span-2" : ""}`}
          disabled={busy}
          onClick={copy}
        >
          <ClipboardCopy className="size-4" aria-hidden />
          Copy as text
        </button>
      </div>

      <h3 className="mt-4 font-display text-xs tracking-[0.16em] text-violet uppercase">
        Load a backup
      </h3>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn min-h-12"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="size-4" aria-hidden />
          Load file
        </button>
        <button type="button" className="btn min-h-12" disabled={busy} onClick={pasteBackup}>
          <ClipboardPaste className="size-4" aria-hidden />
          Paste text
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        aria-label="Backup file"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="mt-2 rounded-md border border-danger/60 p-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {pending && shown && (
        <div className="mt-3">
          <div className="rounded-md border border-cyan/30 p-2 text-xs">
            <p className="text-sm text-cyan">
              Backup from {when(pending.exportedAt)} · {size(shown.bytes)}
            </p>
            <ul className="mt-1 list-disc pl-4 text-muted">
              {shown.what.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <Confirm
            text="Load this backup? Everything this game has on this device is replaced by it, and the game restarts."
            yes="Yes, load it"
            no="No, keep mine"
            onYes={() => restore(pending)}
            onNo={() => setPending(null)}
          />
        </div>
      )}
    </div>
  );
}
