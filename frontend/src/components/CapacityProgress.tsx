export function CapacityProgress({
  reserved,
  capacity,
}: {
  reserved: number;
  capacity: number;
}) {
  const percentage = Math.min(100, Math.round((reserved / capacity) * 100));
  return (
    <div
      className="capacity"
      aria-label={`${reserved} of ${capacity} spots reserved`}
    >
      <p>
        <strong>{reserved}</strong> of {capacity} spots reserved
      </p>
      <div
        className="capacity__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={reserved}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

