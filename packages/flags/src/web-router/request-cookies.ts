import { RequestCookies } from '../spec-extension/cookies';
import { ResponseCookies } from '../spec-extension/cookies';
import { ReflectAdapter } from '../spec-extension/adapters/reflect';

class ReadonlyRequestCookiesError extends Error {
  constructor() {
    super('Cookies can only be modified in a Server Action or Route Handler.');
  }

  public static callable() {
    throw new ReadonlyRequestCookiesError();
  }
}

export type ReadonlyRequestCookies = Omit<
  RequestCookies,
  'set' | 'clear' | 'delete'
> &
  Pick<ResponseCookies, 'set' | 'delete'>;

export class RequestCookiesAdapter {
  public static seal(cookies: RequestCookies): ReadonlyRequestCookies {
    return new Proxy(cookies as any, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'clear':
          case 'delete':
          case 'set':
            return ReadonlyRequestCookiesError.callable;
          default:
            return ReflectAdapter.get(target, prop, receiver);
        }
      },
    });
  }
}
