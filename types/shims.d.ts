declare module 'react' {
  export type ReactNode = any;
  export type MouseEvent<T = any> = any;
  export type FormEvent<T = any> = any;
  export function useState<T>(initial: T): [T, (value: T | ((current: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps?: any[]): T;
  export function useRef<T>(initialValue: T | null): { current: T | null };
}

declare module 'next/link' {
  const Link: any;
  export default Link;
}

declare module 'next/navigation' {
  export function useRouter(): { push(path: string): void; refresh(): void };
  export function notFound(): never;
  export function redirect(path: string): never;
}

declare module 'next/server' {
  export class NextRequest {
    headers: Headers;
    nextUrl: URL;
    json(): Promise<any>;
  }

  export class NextResponse {
    static json(data: any, init?: any): any;
  }
}

declare module 'next/font/google' {
  export function Noto_Sans_SC(config: any): { variable: string };
  export function Noto_Serif_SC(config: any): { variable: string };
}

declare module 'next' {
  export type Metadata = Record<string, unknown>;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
