"use client";

import {useEffect} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowLeft} from "lucide-react";

const storageKey = "lia.legal.returnTo";

export function LegalHubBackLink({returnTo}: {returnTo: string}) {
  const router = useRouter();
  useEffect(() => {
    if (returnTo !== "/") {
      window.sessionStorage.setItem(storageKey, returnTo);
      return;
    }
  }, [returnTo]);
  return <Link href={returnTo} onClick={(event) => {
    if (returnTo !== "/") return;
    const remembered = window.sessionStorage.getItem(storageKey);
    if (!remembered?.startsWith("/") || remembered.startsWith("//")) return;
    event.preventDefault();
    router.push(remembered);
  }} aria-label="Back" className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"><ArrowLeft className="h-5 w-5"/></Link>;
}
