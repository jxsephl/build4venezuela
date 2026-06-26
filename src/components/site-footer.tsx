import Image from "next/image";
import { getTranslations } from "next-intl/server";

const assetPath = "/BFV/assets/";

type Partner = {
  name: string;
  href: string;
  image: string;
  width: number;
  height: number;
  className: string;
};

export async function SiteFooter() {
  const t = await getTranslations("HomePage");
  const partners = t.raw("partners") as Partner[];

  return (
    <footer className="bg-background px-5 py-14 text-foreground sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col-reverse gap-10 border-border border-t pt-12 md:flex-row md:items-center md:justify-between">
        <p className="max-w-md font-mono text-xs uppercase leading-6 tracking-[0.2em] text-muted-foreground">
          {t("footer.description")}
        </p>

        <div className="grid w-full max-w-[460px] grid-cols-4 items-center gap-3 sm:max-w-[740px] sm:gap-10 md:w-auto">
          {partners.map((partner) => (
            <a
              className="transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              href={partner.href}
              key={partner.name}
              rel="noreferrer"
              target="_blank"
            >
              <Image
                alt={partner.name}
                className={partner.className}
                draggable="false"
                height={partner.height}
                src={`${assetPath}${partner.image}`}
                width={partner.width}
              />
            </a>
          ))}
          <a
            className="transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            href="http://nucleo.la/"
            rel="noreferrer"
            target="_blank"
          >
            <Image
              alt="Nucleo"
              className="mx-auto h-auto w-full max-w-[160px] select-none sm:max-w-[190px]"
              draggable="false"
              height={107}
              src={`${assetPath}nucleo-wordmark-blanco.png`}
              width={190}
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
