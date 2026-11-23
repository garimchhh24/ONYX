/** `next/link` for the claude.ai preview build: client-side navigation through the in-memory router. */
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { navigate } from './router';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  children?: ReactNode;
};

export default function Link({ href, replace, scroll, prefetch, onClick, children, ...rest }: Props) {
  void prefetch;
  return (
    <a
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        navigate(href, { replace, scroll: scroll !== false });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
