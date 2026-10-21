"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banner, Button, Icon, Modal } from "../../../../../components/ui";
import { checkPurchase } from "./actions";

const EVERY_MS = 4_000;
const GIVE_UP_AFTER_MS = 3 * 60_000;
const count = (value: number) => value.toLocaleString("en-US");

/**
 * The purchase the member just came back from. While it's still pending (a bank transfer settling), a modal with
 * a spinner asks Bachs again every few seconds; it turns into a confirmation when the credits land, or says so
 * if it's taking long. Once closed, a banner keeps the result. The query string is dropped, so a refresh doesn't
 * bring back a stale message.
 */
export function PurchaseStatus({ sessionId, initial, credits }: { sessionId: string; initial: "paid" | "pending"; credits: number }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [slow, setSlow] = useState(false);
  // Already paid when the page loaded: no modal, just the banner.
  const [modalOpen, setModalOpen] = useState(initial === "pending");

  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (status !== "pending") return;
    const started = Date.now();
    let stopped = false;
    const timer = setInterval(async () => {
      if (Date.now() - started > GIVE_UP_AFTER_MS) setSlow(true);
      const result = await checkPurchase(sessionId);
      if (stopped || result.status !== "paid") return;
      clearInterval(timer);
      setStatus("paid");
      router.refresh();
    }, EVERY_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [status, sessionId, router]);

  const paid = status === "paid";
  return (
    <>
      {modalOpen && (
        <Modal
          title={paid ? "Payment confirmed" : slow ? "Still confirming" : "Confirming your payment"}
          onClose={paid || slow ? () => setModalOpen(false) : undefined}
          actions={paid
            ? <Button onClick={() => setModalOpen(false)}>Done</Button>
            : slow ? <Button variant="secondary" onClick={() => setModalOpen(false)}>Close</Button> : null}
        >
          <div className="wr-confirm" aria-live="polite">
            <span className="wr-confirm-icon" data-state={paid ? "done" : "busy"}>
              <Icon name={paid ? "check" : "spinner"} size={28} strokeWidth={paid ? 2.4 : 2} />
            </span>
            <span>
              {paid
                ? <><strong>{count(credits)} credits</strong> are in your balance. A receipt is on its way to your email.</>
                : slow
                  ? "Bachs hasn't confirmed it yet; some bank transfers take a while. You can close this: your credits are added automatically once it clears, and you'll get a receipt by email."
                  : "Checking with Bachs. This usually takes a few seconds. Please keep this page open."}
            </span>
          </div>
        </Modal>
      )}
      {!modalOpen && (paid
        ? <Banner tone="success" title="Payment confirmed">{count(credits)} credits are in your balance. A receipt is on its way to your email.</Banner>
        : <Banner tone="info" title="Payment still settling">Your credits are added automatically once Bachs confirms it. You&apos;ll get a receipt by email.</Banner>)}
    </>
  );
}
