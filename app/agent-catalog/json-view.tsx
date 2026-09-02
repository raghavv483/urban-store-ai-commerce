/**
 * Minimal JSON syntax highlighter.
 *
 * Hand-rolled rather than pulling in a highlighting library: the input is one
 * known-shape document we generate ourselves, the whole tokenizer is ~30 lines,
 * and a library would ship a code-editor theme that fights the rest of the app.
 * Colours come from the same token palette everything else uses, so this reads
 * as part of the product rather than an embedded IDE.
 */

type Token = {
  text: string;
  kind: "key" | "string" | "number" | "literal" | "punct";
};

const CLASS: Record<Token["kind"], string> = {
  key: "text-indigo-700 dark:text-indigo-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-400",
  literal: "text-rose-700 dark:text-rose-400",
  punct: "text-muted-foreground",
};

/**
 * Splits pretty-printed JSON into typed spans.
 *
 * The regex matches, in order: a quoted string (with escapes) optionally followed
 * by a colon — which is what makes it a key rather than a value — then numbers,
 * then the three literals. Anything else falls through as punctuation.
 */
function tokenize(json: string): Token[] {
  const pattern =
    /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(json)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: json.slice(lastIndex, match.index), kind: "punct" });
    }

    const [full, quoted, colon, num, literal] = match;
    if (quoted !== undefined) {
      tokens.push({ text: quoted, kind: colon ? "key" : "string" });
      if (colon) tokens.push({ text: colon, kind: "punct" });
    } else if (num !== undefined) {
      tokens.push({ text: num, kind: "number" });
    } else if (literal !== undefined) {
      tokens.push({ text: literal, kind: "literal" });
    } else {
      tokens.push({ text: full, kind: "punct" });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < json.length) {
    tokens.push({ text: json.slice(lastIndex), kind: "punct" });
  }
  return tokens;
}

export function JsonView({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  const tokens = tokenize(json);

  return (
    <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-5 text-[12.5px] leading-relaxed">
      <code className="font-mono">
        {tokens.map((t, i) => (
          <span key={i} className={CLASS[t.kind]}>
            {t.text}
          </span>
        ))}
      </code>
    </pre>
  );
}
