/** Chakana simplificada: cruz escalonada de tres peldaños por brazo con círculo hueco. */
export const CHAKANA_PATH =
  "M96 186 L96 156 L126 156 L126 126 L156 126 L156 96 L186 96 L326 96 L356 96 L356 126 L386 126 L386 156 L416 156 L416 186 L416 326 L416 356 L386 356 L386 386 L356 386 L356 416 L326 416 L186 416 L156 416 L156 386 L126 386 L126 356 L96 356 L96 326 Z M256 200 A56 56 0 1 0 256 312 A56 56 0 1 0 256 200 Z";

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="512" height="512" rx="22%" fill="var(--bg)" />
      <path
        d={CHAKANA_PATH}
        fill="var(--accent)"
        fillRule="evenodd"
        stroke="var(--accent)"
        strokeWidth={18}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
