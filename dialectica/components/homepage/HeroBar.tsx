"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Mode } from "@/lib/data/users";

type Quote = { text: string; author: string };

const QUOTES: Quote[] = [
  {
    text: "If I have seen further it is by standing on the shoulders of giants.",
    author: "Isaac Newton",
  },
  {
    text: "Plato is dear to me, but dearer still is truth.",
    author: "Aristotle",
  },
  {
    text: "The aim of argument, or of discussion, should not be victory, but progress.",
    author: "Joseph Joubert",
  },
  {
    text: "The beginning of wisdom is the definition of terms.",
    author: "Socrates",
  },
  {
    text: "Facts are stubborn things.",
    author: "John Adams",
  },
  {
    text: "In God we trust; all others must bring data.",
    author: "W. Edwards Deming",
  },
  {
    text: "When the facts change, I change my mind. What do you do, sir?",
    author: "John Maynard Keynes",
  },
  {
    text: "Everything should be made as simple as possible, but not simpler.",
    author: "Albert Einstein",
  },
  {
    text: "Truth is the daughter of time.",
    author: "Francis Bacon",
  },
  {
    text: "The eye sees only what the mind is prepared to comprehend.",
    author: "Henri Bergson",
  },
  {
    text: "To call a thing inexplicable is merely to say that no explanation has yet been found.",
    author: "Thomas Huxley",
  },
  {
    text: "Most controversies would soon be ended, if those engaged in them would first accurately define their terms, and then adhere to their definitions.",
    author: "Tyrion Edwards",
  },
];

const STORAGE_KEY = "dia-homepage-quote-index";

export function HeroBar({ mode }: { mode: Mode }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const n = Number(stored);
        if (Number.isInteger(n) && n >= 0 && n < QUOTES.length) {
          setIndex(n);
          return;
        }
      }
      const next = Math.floor(Math.random() * QUOTES.length);
      sessionStorage.setItem(STORAGE_KEY, String(next));
      setIndex(next);
    } catch {
      setIndex(Math.floor(Math.random() * QUOTES.length));
    }
  }, []);

  const quote = QUOTES[index];

  return (
    <div className="flex items-start justify-between gap-12 pt-[55px]">
      <p className="max-w-[1199px] text-[44px] font-normal leading-tight tracking-[-0.88px] text-dia-fg">
        &ldquo;{quote.text}&rdquo; &mdash;{quote.author}
      </p>
      {mode === "edit" && (
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <AdminLink />
        </div>
      )}
    </div>
  );
}

function AdminLink() {
  return (
    <Link
      href="/admin"
      className="flex h-11 w-36 items-center justify-center rounded-full bg-dia-mint font-mono text-[13px] font-bold tracking-[0.52px] text-black"
    >
      ADMIN
    </Link>
  );
}
