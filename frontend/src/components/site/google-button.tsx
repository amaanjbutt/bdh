// "Continue with Google" — links to the backend's server-side OAuth start
// endpoint, which redirects to Google and handles the callback + session.
const GOOGLE_START = "https://api.bangladatahub.com/auth/google/start";

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <a
      href={GOOGLE_START}
      className="flex w-full items-center justify-center gap-3 border border-rule bg-paper px-5 py-2.5 text-[14px] transition-colors hover:border-seal hover:text-seal"
    >
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.9 6.8-17.4z" />
        <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6.1C1 15.8 0 19.8 0 24s1 8.2 2.6 11.4l7.8-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.2-8.6 2.2-6.4 0-11.7-4.3-13.6-10.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
      </svg>
      {label}
    </a>
  );
}

// A labelled divider ("or") to sit between social and email auth.
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-[12px] text-ink-soft">
      <span className="h-px flex-1 bg-rule" />
      or
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}
