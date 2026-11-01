import { DANGER } from "@/components/game/feel";

/** Two buttons to say yes or no, the safe answer first. */
export function Confirm({
  text,
  yes,
  no,
  onYes,
  onNo,
}: {
  text: string;
  yes: string;
  no: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div
      className="mt-2 rounded-md border border-danger/60 p-3"
      role="alertdialog"
      aria-label={text}
    >
      <p className="text-sm text-fg">{text}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn min-h-12" onClick={onNo} autoFocus>
          {no}
        </button>
        <button type="button" className="btn min-h-12" style={DANGER} onClick={onYes}>
          {yes}
        </button>
      </div>
    </div>
  );
}
