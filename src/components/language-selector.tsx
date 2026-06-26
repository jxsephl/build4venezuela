"use client";

import { CaretDownIcon, CheckIcon, TranslateIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LanguageSelector() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Header.languageSelector");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="border-white/35 bg-white text-black hover:bg-[#fcd43d] hover:text-black aria-expanded:bg-[#fcd43d] aria-expanded:text-black"
            variant="outline"
            size="sm"
          />
        }
      >
        <TranslateIcon data-icon="inline-start" />
        <span>{t(`locales.${locale}`)}</span>
        <CaretDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-36 border-white/20 bg-black text-white ring-white/20"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-white/55">
            {t("label")}
          </DropdownMenuLabel>
          {routing.locales.map((option) => (
            <DropdownMenuItem
              className="justify-between focus:bg-white focus:text-black"
              key={option}
              render={<Link href={pathname} locale={option} />}
            >
              {t(`locales.${option}`)}
              {option === locale ? <CheckIcon /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
