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
            className="h-auto border-border bg-foreground py-2 text-background hover:bg-primary hover:text-primary-foreground aria-expanded:bg-primary aria-expanded:text-primary-foreground"
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
        className="min-w-36 border-border bg-popover text-popover-foreground ring-border"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground">
            {t("label")}
          </DropdownMenuLabel>
          {routing.locales.map((option) => (
            <DropdownMenuItem
              className="justify-between focus:bg-foreground focus:text-background"
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
