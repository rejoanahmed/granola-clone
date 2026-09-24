import type { TicketCode } from "@gc/domain/Domain/Ids";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { checkInMutation, hasTag } from "@web/lib/api";
import { cn } from "@web/lib/utils";
import { type FormEvent, useState } from "react";

// Typed or wedge-scanned, no camera. A second scan of the same code matches zero rows server-side
// and comes back as a 409 carrying the first scan's time — "already inside" is not "not a ticket".
export const Route = createFileRoute("/organiser/scan")({
  component: ScanPage,
});

type Scan = {
  readonly code: string;
  readonly detail: string;
  readonly tone: "bad" | "good" | "warn";
};

/** A wedge scanner emits whitespace and sometimes dashes; the domain accepts neither. */
const normaliseCode = (raw: string): string =>
  raw.trim().toUpperCase().replaceAll(/[\s-]/g, "");

function ScanPage() {
  const [code, setCode] = useState("");
  const [log, setLog] = useState<readonly Scan[]>([]);

  const checkIn = useMutation({
    ...checkInMutation(),
    meta: { inlineError: true },
  });

  const record = (entry: Scan) => setLog((current) => [entry, ...current]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalised = normaliseCode(code);
    setCode("");
    if (normalised.length === 0) {
      return;
    }

    try {
      const ticket = await checkIn.mutateAsync({
        code: normalised as TicketCode,
      });
      record({
        code: ticket.code,
        detail: `Admitted · ticket #${ticket.seq}`,
        tone: "good",
      });
    } catch (caught) {
      const details =
        (caught as { details?: Record<string, unknown> }).details ?? {};

      if (hasTag(caught, "TicketAlreadyCheckedIn")) {
        const at =
          typeof details.checkedInAt === "number" ? details.checkedInAt : null;
        record({
          code: normalised,
          detail: at
            ? `Already inside — first scanned ${formatDhakaDateTime(at)}`
            : "Already inside",
          tone: "warn",
        });
        return;
      }
      if (hasTag(caught, "TicketVoid")) {
        record({
          code: normalised,
          detail: "Void — this ticket was refunded or its event was cancelled",
          tone: "bad",
        });
        return;
      }
      if (hasTag(caught, "TicketNotFound")) {
        record({ code: normalised, detail: "No such code", tone: "bad" });
        return;
      }
      record({
        code: normalised,
        detail: caught instanceof Error ? caught.message : "Check-in failed",
        tone: "bad",
      });
    }
  };

  const tone = {
    bad: "text-bad",
    good: "text-good",
    warn: "text-warn",
  } as const;

  return (
    <section className="mt-6 max-w-lg">
      <h1 className="font-semibold text-2xl">Gate check-in</h1>
      <p className="mt-1 text-muted text-sm">
        Type or scan the ten-character code on the ticket.
      </p>

      <form className="mt-4 flex gap-2" onSubmit={submit}>
        {/* autoFocus on purpose: a gate terminal exists to receive the next code. */}
        <input
          aria-label="Ticket code"
          autoComplete="off"
          autoFocus
          className="evb-field font-mono uppercase tracking-widest"
          onChange={(changed) => setCode(changed.currentTarget.value)}
          placeholder="ABCD123XYZ"
          value={code}
        />
        <button
          className="evb-button"
          disabled={checkIn.isPending}
          type="submit"
        >
          Admit
        </button>
      </form>

      <ul className="mt-6 grid gap-2">
        {log.map((entry, i) => (
          <li
            className="evb-card flex items-baseline justify-between gap-3"
            // biome-ignore lint/suspicious/noArrayIndexKey: the same code may legitimately repeat
            key={`${entry.code}-${i}`}
          >
            <span className="font-mono text-sm">{entry.code}</span>
            <span className={cn("text-right text-xs", tone[entry.tone])}>
              {entry.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
