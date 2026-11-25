import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { fetchFileBlob } from './api';

marked.setOptions({ gfm: true, breaks: true });

const FILE_PREFIX = '/api/files/';

/**
 * Markdown renderizzato e sanificato. Le immagini salvate in MyMonday richiedono il token,
 * quindi vengono scaricate via fetch e sostituite con URL blob locali.
 */
export function Markdown({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content ?? '', { async: false }) as string), [content]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const created: string[] = [];
    let cancelled = false;
    root.querySelectorAll<HTMLImageElement>(`img[src^="${FILE_PREFIX}"]`).forEach((img) => {
      const fileId = img.getAttribute('src')!.slice(FILE_PREFIX.length);
      img.removeAttribute('src');
      fetchFileBlob(fileId)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          img.src = url;
        })
        .catch(() => (img.alt = `${img.alt} (non disponibile)`));
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [html]);

  return <div ref={ref} className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
