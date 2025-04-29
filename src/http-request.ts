import * as superagent from 'superagent';

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const RETRY_DELAY_MS = 1000; // 1 second

export const sendHttpRequest = async (options: HttpRequestOptions) => {
  try {
    return await _executeRequest(options);
  }
  catch (err) {
    console.error(`Error during ${(options.method || HttpMethods.GET).toUpperCase()} request to ${options.url}:`, err);
    if (_shouldRetry(err)) {
      console.log(`Retrying ${(options.method || HttpMethods.GET).toUpperCase()} request to ${options.url}...`);
      await _delay(RETRY_DELAY_MS);
      return await _executeRequest(options);
    }
    throw err;
  }
};

const _executeRequest = async (options: HttpRequestOptions) => {
  const { method = HttpMethods.GET, url, token, query, body } = options;
  let request = superagent[method](url)
    .auth(token, '')
    .timeout(DEFAULT_TIMEOUT_MS);

  if (query) {
    request = request.query(query);
  }

  if (body) {
    request = request.send(body);
  }

  return await request;
}

// retry on network issues
const _shouldRetry = (err): boolean => {
  return err.timeout ||
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET';
}

const _delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type HttpRequestOptions = {
  method?: HttpMethods;
  url: string;
  token: string;
  query?: Record<string, any>;
  body?: Record<string, any>;
}

export enum HttpMethods {
  GET = 'get',
  POST = 'post',
  PUT = 'put',
  DELETE = 'delete',
  PATCH = 'patch',
}
