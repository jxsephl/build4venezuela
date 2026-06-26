import { getTranslations } from "next-intl/server";
import { LanguageSelector } from "@/components/language-selector";
import { Link } from "@/i18n/navigation";

export async function SiteHeader() {
  const t = await getTranslations("Header");

  return (
    <header className="fixed inset-x-0 top-0 isolate z-40 border-white/15 border-b bg-black/95 px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link
          className="font-mono text-sm font-black uppercase leading-none tracking-[0.18em] text-white transition hover:text-[#fcd43d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fcd43d] focus-visible:ring-offset-4 focus-visible:ring-offset-black sm:text-base"
          href="/"
        >
          <span className="sm:hidden">{t("mobileBrand")}</span>
          <span className="hidden sm:inline">{t("brand")}</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <nav aria-label={t("navigationLabel")}>
            <Link
              className="inline-flex border border-white/25 px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:border-white hover:bg-white hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fcd43d] focus-visible:ring-offset-4 focus-visible:ring-offset-black sm:px-4"
              href="/brand"
            >
              {t("brandPageLink")}
            </Link>
          </nav>
          <LanguageSelector />
        </div>
      </div>
    </header>
  );
}
