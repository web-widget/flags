import {
  defineMiddlewareHandler,
  composeMiddleware,
} from '@web-widget/helpers';
import { createHandle } from 'flags/web-router';
import * as flags from '../config/flags';

const poweredByMiddleware = defineMiddlewareHandler(
  async function poweredBy(ctx, next) {
    ctx.state.test = 'hello world';
    const resp = await next();
    resp.headers.set('X-Powered-By', '@web-widget/web-router');

    return resp;
  },
);

const flagsMiddleware = createHandle({ flags });

export default composeMiddleware([poweredByMiddleware, flagsMiddleware]);
