import { Link } from "@tanstack/react-router";
import { SITE } from "@web/site";

export function Logo() {
  return (
    <Link className="flex items-center gap-2.5 font-serif text-xl" to="/">
      <img alt="" height={32} src="/icon.svg" width={32} />
      {SITE.name}
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border-hairline bg-bg-app/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Logo />
        <div className="hidden items-center gap-7 text-sm text-text-secondary md:flex">
          <a className="hover:text-text-primary" href="/#features">
            Features
          </a>
          <a className="hover:text-text-primary" href="/#how">
            How it works
          </a>
          <a className="hover:text-text-primary" href="/#privacy">
            Privacy
          </a>
          <a className="hover:text-text-primary" href="/#faq">
            FAQ
          </a>
        </div>
        <a
          className="rounded-full bg-accent-lime px-4 py-2 font-semibold text-sm text-text-on-light hover:opacity-90"
          href={SITE.selfHosting}
        >
          Set up your server
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-text-secondary md:flex-row md:items-center md:justify-between">
        <Logo />
        <div className="flex flex-wrap gap-6">
          <Link className="hover:text-text-primary" to="/privacy">
            Privacy policy
          </Link>
          <a className="hover:text-text-primary" href={SITE.selfHosting}>
            Self-hosting guide
          </a>
          <a className="hover:text-text-primary" href={SITE.repo}>
            Source code
          </a>
          <a className="hover:text-text-primary" href="/#support">
            Support
          </a>
        </div>
        <p className="text-text-tertiary">
          © {new Date().getFullYear()} {SITE.name}
        </p>
      </div>
    </footer>
  );
}
