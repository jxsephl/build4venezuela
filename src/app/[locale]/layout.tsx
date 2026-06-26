import type { Metadata } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

const inputMonoNarrow = localFont({
  src: [
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Light-Testing.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-LightItalic-Testing.ttf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Regular-Testing.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Italic-Testing.ttf",
      weight: "400",
      style: "italic",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Medium-Testing.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-MediumItalic-Testing.ttf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Bold-Testing.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-BoldItalic-Testing.ttf",
      weight: "700",
      style: "italic",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-Black-Testing.ttf",
      weight: "900",
      style: "normal",
    },
    {
      path: "../../../public/BFV/fonts/InputMonoNarrow-BlackItalic-Testing.ttf",
      weight: "900",
      style: "italic",
    },
  ],
  display: "swap",
  fallback: ["monospace"],
  variable: "--font-input-mono-narrow",
});

type Props = Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${inputMonoNarrow.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
