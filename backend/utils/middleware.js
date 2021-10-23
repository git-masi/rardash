import middy from '@middy/core';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpEventNormalizer from '@middy/http-event-normalizer';
import httpErrorHandler from '@middy/http-error-handler';

const commonMiddlewareGroup = [
  httpJsonBodyParser(),
  httpEventNormalizer(),
  httpErrorHandler(),
];

export function commonMiddleware(handler) {
  return middy(handler).use(commonMiddlewareGroup);
}
