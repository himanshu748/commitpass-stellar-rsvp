import {
  CircleCheck,
  ExternalLink,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";

type TransactionStatusValue = {
  mode: "demo" | "contract";
  status: "signing" | "submitting" | "confirmed" | "failed";
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

  return (
    <div
      className={`transaction-status transaction-status--${transaction.status}`}
      role="status"
    >
      <Icon
        size={21}
        className={
          transaction.status === "signing" ||
          transaction.status === "submitting"
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
              : transaction.status === "signing"
                ? isDemo
                  ? "Simulating authorization"
                  : "Waiting for signature"
                : isDemo
                  ? "Advancing demo state"
                  : "Submitting transaction"}
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
