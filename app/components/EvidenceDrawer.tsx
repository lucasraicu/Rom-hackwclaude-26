"use client";

import { useEffect, useRef } from "react";
import type { Allocation, Fund } from "@/lib/types";

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    amount,
  );
const statuses = {
  supported: "Supported",
  needs_evidence: "Needs evidence",
  not_allowable: "Not eligible for grants",
};

export function EvidenceDrawer({
  item,
  previous,
  funds,
  review,
  onReview,
  onClose,
}: {
  item: Allocation;
  previous?: Allocation;
  funds: Fund[];
  review?: "accepted" | "rejected";
  onReview: (decision: "accepted" | "rejected") => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement | null;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keepFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !element) return;
      const controls = Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    element?.addEventListener("keydown", keepFocus);
    return () => {
      element?.removeEventListener("keydown", keepFocus);
      element?.close();
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, []);
  const changed =
    previous &&
    JSON.stringify([previous.status, previous.splits, previous.reason]) !==
      JSON.stringify([item.status, item.splits, item.reason]);
  return (
    <dialog
      ref={dialog}
      className="evidence-drawer"
      aria-labelledby="evidence-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <header className="drawer-header">
        <div>
          <p className="eyebrow">ALLOCATION EVIDENCE · {item.itemId}</p>
          <h2 id="evidence-title">{item.label}</h2>
        </div>
        <button
          className="close-button"
          aria-label="Close evidence drawer"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <p className="drawer-demo-label">
        Pre-Analyzed Demo Results | No live Claude API call
      </p>
      <div className="drawer-body">
        <div className="drawer-cost">
          <strong>{money(item.amount)}</strong>
          <span className={`status-chip ${item.status}`}>
            {statuses[item.status]}
          </span>
        </div>
        <p className="drawer-description">{item.description}</p>
        <section>
          <h3>Why this proposal</h3>
          <p>{item.reason}</p>
        </section>
        {item.missingEvidence && (
          <section className="missing-evidence">
            <h3>Evidence still needed</h3>
            <p>{item.missingEvidence}</p>
          </section>
        )}
        <section>
          <h3>Proposed fund split</h3>
          {item.splits.length ? (
            <ul className="drawer-splits">
              {item.splits.map((split) => (
                <li key={split.fund}>
                  <span>
                    {funds.find((fund) => fund.code === split.fund)?.name ??
                      split.fund}
                  </span>
                  <strong>
                    {split.percent}%<small>{money(split.amount)}</small>
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No fund split is supported by the current evidence.</p>
          )}
        </section>
        {changed && (
          <section className="comparison">
            <h3>What changed after the correction</h3>
            <div>
              <span>Before</span>
              <strong>{statuses[previous.status]}</strong>
              <p>{previous.reason}</p>
              {previous.splits.map((split) => (
                <p key={split.fund}>
                  {split.fund}: {split.percent}% · {money(split.amount)}
                </p>
              ))}
            </div>
            <div>
              <span>Now</span>
              <strong>{statuses[item.status]}</strong>
              <p>{item.reason}</p>
              {item.splits.map((split) => (
                <p key={split.fund}>
                  {split.fund}: {split.percent}% · {money(split.amount)}
                </p>
              ))}
            </div>
          </section>
        )}
        <section>
          <h3>
            Source evidence{" "}
            <span className="count-label">{item.citations.length}</span>
          </h3>
          <p className="evidence-note">
            A verified quote matches the source text. It does not certify that
            the allocation is compliant.
          </p>
          {item.citations.length ? (
            item.citations.map((citation, index) => (
              <article
                className="citation"
                key={`${citation.sourceDoc}-${citation.page}-${index}`}
              >
                <div className="citation-heading">
                  <span>
                    {citation.sourceDoc} · p. {citation.page}
                  </span>
                  <span
                    className={`verification-badge ${citation.verified === true ? "verified" : "unverified"}`}
                  >
                    {citation.verified === true
                      ? "✓ Source verified"
                      : citation.verified === false
                        ? "Quote not verified"
                        : "Not checked"}
                  </span>
                </div>
                <blockquote>“{citation.quote}”</blockquote>
              </article>
            ))
          ) : (
            <p>No source quotes were supplied for this proposal.</p>
          )}
        </section>
        {!!item.regulations?.length && (
          <section>
            <h3>Referenced provisions</h3>
            <ul className="regulations">
              {item.regulations.map((reference) => (
                <li key={reference}>{reference}</li>
              ))}
            </ul>
            <p className="evidence-note">
              References supplied with this proposal; review their applicability
              alongside the grant terms.
            </p>
          </section>
        )}
      </div>
      <footer className="drawer-footer">
        <p role="status">
          {review === "accepted"
            ? "Proposal accepted in this session."
            : review === "rejected"
              ? "Proposal rejected in this session."
              : "Your decision stays in this browser session."}
        </p>
        <div>
          <button
            className="button secondary"
            aria-pressed={review === "rejected"}
            onClick={() => onReview("rejected")}
          >
            Reject proposal
          </button>
          <button
            className="button primary"
            aria-pressed={review === "accepted"}
            onClick={() => onReview("accepted")}
          >
            Accept proposal
          </button>
        </div>
      </footer>
    </dialog>
  );
}
