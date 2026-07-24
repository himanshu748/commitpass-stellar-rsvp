import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

type TransactionStatusValue = {
  mode: "demo" | "contract";
  status:
    | "simulating"
    | "awaiting-signature"
    | "signing"
    | "submitted"
    | "pending"
    | "submitting"
    | "confirmed"
    | "failed";
  hash?: string;
  message: string;
} | null;

export function TransactionStatus({
  transaction,
}: {
  transaction: TransactionStatusValue;
}) {
  if (!transaction) return null;
  const confirmed = transaction.status === "confirmed";
  const failed = transaction.status === "failed";
  const isDemo = transaction.mode === "demo";
  const Icon = confirmed ? CircleCheck : failed ? ShieldAlert : LoaderCircle;
  const awaitingSignature =
    transaction.status === "awaiting-signature" ||
    transaction.status === "signing";
  const waitingForLedger =
    transaction.status === "submitted" ||
    transaction.status === "pending" ||
    transaction.status === "submitting";

  return (
    <div
      className={`transaction-status transaction-status--${transaction.status}`}
      role="status"
    >
      <Icon
        size={21}
        className={
          !confirmed && !failed
            ? "spin"
            : undefined
        }
      />
      <div>
        <strong>
          {confirmed
            ? isDemo
              ? "Demo state complete"
              : "Confirmed on Testnet"
            : failed
              ? isDemo
                ? "Demo step failed"
                : "Transaction failed"
              : awaitingSignature
                ? isDemo
                  ? "Simulating authorization"
                  : "Waiting for signature"
                : waitingForLedger
                  ? isDemo
                    ? "Advancing demo state"
                    : "Pending on Testnet"
                  : transaction.status === "simulating"
                    ? isDemo
                      ? "Preparing demo state"
                      : "Simulating contract call"
                    : isDemo
                  ? "Advancing demo state"
                  : "Preparing transaction"}
        </strong>
        <p>{transaction.message}</p>
        {transaction.hash && !isDemo ? (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${transaction.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
    </div>
  );
}
