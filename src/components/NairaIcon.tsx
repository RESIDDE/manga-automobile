export function NairaIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 4v16" />
      <path d="M19 4v16" />
      <path d="M5 4l14 16" />
      <path d="M3 10h18" />
      <path d="M3 14h18" />
    </svg>
  );
}
