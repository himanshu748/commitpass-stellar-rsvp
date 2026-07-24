import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link className="brand" to="/" aria-label="CommitPass home">
      <svg
        className="brand__mark"
        viewBox="0 0 44 44"
        aria-hidden="true"
      >
        <path
          d="M9.2 21.2A13.4 13.4 0 0 1 31.9 9.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <path
          d="m28.2 6.6 4.7 3.1-1.1-5.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        <path
          d="M34.8 22.8A13.4 13.4 0 0 1 12 34.2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <path
          d="m15.8 37.4-4.7-3.1 1.1 5.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
        <circle cx="22" cy="22" r="5.7" fill="#ff4f12" />
      </svg>
      <span className="brand__word">commitpass</span>
    </Link>
  );
}

