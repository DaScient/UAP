'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  src: string;
  dataSource?: string;
  refreshInterval?: number;
  theme?: 'dark' | 'light';
  llmProvider?: 'openai' | 'anthropic' | 'local';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'ufo-intel-widget': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          'data-source'?: string;
          'refresh-interval'?: string | number;
          'llm-provider'?: string;
          theme?: string;
        },
        HTMLElement
      >;
    }
  }
}

/**
 * Thin React wrapper around the framework-agnostic <ufo-intel-widget>
 * Web Component. The component itself is a single static JS file served
 * from /public/widgets so it can also be embedded into any non-Next.js
 * intranet portal without a build step.
 */
export default function UfoIntelWidget({
  src,
  dataSource = 'https://war.gov/UFO/index.json',
  refreshInterval = 30,
  theme = 'dark',
  llmProvider = 'openai',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (customElements.get('ufo-intel-widget')) {
      setLoaded(true);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => setLoaded(true);
    s.onerror = () => setError(`Failed to load widget script at ${src}`);
    document.head.appendChild(s);
  }, [src]);

  if (error) {
    return (
      <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="h-[720px] w-full overflow-hidden rounded-lg border border-slate-800/80"
      aria-busy={!loaded}
    >
      {/* The custom element renders even before the script loads; once the
          script registers `ufo-intel-widget`, the element upgrades in place. */}
      <ufo-intel-widget
        data-source={dataSource}
        refresh-interval={String(refreshInterval)}
        theme={theme}
        llm-provider={llmProvider}
        style={{ display: 'block', height: '100%' }}
      />
    </div>
  );
}
