/**
 * The three public guides, listed in the order someone actually needs them: what the app does,
 * why it works that way, how to get it onto another device. Shared by the /guides page and the
 * Help page so both stay in step, and kept in a plain module (not a "use client" one) so server
 * components get the real array rather than a proxy.
 */
export const GUIDES = [
  {
    href: "/guide",
    label: "Using Mainline",
    hint: "What each part of the app does, in the order you meet it.",
  },
  {
    href: "/method",
    label: "The Mainline method",
    hint: "The system behind the app, in plain English.",
  },
  {
    href: "/setup",
    label: "Set up Mainline",
    hint: "Install it on another computer or phone, and sign in there.",
  },
] as const;
