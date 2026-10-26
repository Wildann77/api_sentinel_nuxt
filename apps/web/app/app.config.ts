// apps/web/app/app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: "emerald",
      neutral: "zinc",
    },
    button: {
      defaultVariants: {
        size: "sm",
        color: "primary",
        variant: "solid",
      },
      slots: {
        base: "font-mono rounded-xs transition-colors duration-150 cursor-pointer shadow-none",
      },
    },
    input: {
      defaultVariants: {
        size: "sm",
      },
      slots: {
        base: "font-mono rounded-xs border border-hairline bg-surface text-text-primary placeholder:text-text-muted focus:border-hairline-strong focus:ring-0 shadow-none",
      },
    },
    badge: {
      defaultVariants: {
        size: "sm",
        variant: "subtle",
      },
      slots: {
        base: "font-mono font-medium rounded-xs border uppercase tracking-wider",
      },
    },
    table: {
      slots: {
        th: "font-mono text-xs font-semibold text-text-secondary border-b border-hairline uppercase bg-canvas-subtle py-2.5 px-3",
        td: "font-mono text-xs text-text-primary border-b border-hairline py-2 px-3",
        tr: "hover:bg-surface-hover transition-colors",
      },
    },
    card: {
      slots: {
        root: "rounded-none border border-hairline bg-surface shadow-none",
        header: "border-b border-hairline px-4 py-3",
        body: "p-4",
      },
    },
  },
});
