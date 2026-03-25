import { Capacitor, CapacitorHttp, type HttpHeaders, type HttpResponse } from '@capacitor/core';
import { AppSettings } from "../types";

export interface WebDAVFile {
    filename: string;
    etag: string | null;
    lastMod: string | null;
}

interface WebDavHeaderAccessor {
    get(name: string): string | null;
}

interface WebDavResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: WebDavHeaderAccessor;
    text(): Promise<string>;
}

const REQUEST_TIMEOUT_MS = 20000;

const shouldUseNativeIosHttp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

const createHeaderAccessor = (headers?: Headers | HttpHeaders): WebDavHeaderAccessor => {
    if (headers instanceof Headers) {
        return {
            get(name: string) {
                return headers.get(name);
            }
        };
    }

    const normalized = new Map<string, string>();
    Object.entries(headers || {}).forEach(([key, value]) => {
        normalized.set(key.toLowerCase(), String(value));
    });

    return {
        get(name: string) {
            return normalized.get(name.toLowerCase()) || null;
        }
    };
};

const serializeResponseData = (data: any): string => {
    if (typeof data === 'string') return data;
    if (data == null) return '';
    if (typeof data === 'object') return JSON.stringify(data, null, 2);
    return String(data);
};

const toNativeWebDavResponse = (response: HttpResponse): WebDavResponse => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: '',
    headers: createHeaderAccessor(response.headers),
    async text() {
        return serializeResponseData(response.data);
    }
});

const toFetchWebDavResponse = (response: Response): WebDavResponse => ({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: createHeaderAccessor(response.headers),
    async text() {
        return response.text();
    }
});

const formatStatusSuffix = (response: WebDavResponse) => response.statusText ? `: ${response.statusText}` : '';

export class WebDAVService {
  private url: string;
  private auth: string;
  private headers: HeadersInit;

  constructor(settings: AppSettings) {
    let rawUrl = (settings.webdavUrl || '').trim();
    const user = (settings.webdavUser || '').trim();
    const pass = (settings.webdavPass || '').trim();

    // 1. URL Normalization
    // If missing protocol, prepend https://
    if (rawUrl && !/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
    }
    // Remove trailing slashes to ensure consistency in path concatenation
    this.url = rawUrl.replace(/\/+$/, '');

    // 2. Auth Encoding
    // Use UTF-8 safe encoding for Basic Auth
    try {
        const token = btoa(
            encodeURIComponent(`${user}:${pass}`).replace(/%([0-9A-F]{2})/g,
                function toSolidBytes(_match, p1) {
                    return String.fromCharCode(parseInt(p1, 16));
                })
        );
        this.auth = `Basic ${token}`;
    } catch (e) {
        console.error("Auth encoding failed", e);
        this.auth = '';
    }

    this.headers = {
        'Authorization': this.auth,
    };
  }

  private async performNativeRequest(method: string, fullUrl: string, body?: string | Blob, customHeaders: HeadersInit = {}): Promise<WebDavResponse> {
    const data = body == null ? undefined : (typeof body === 'string' ? body : await body.text());
    const mergedHeaders: HttpHeaders = {
        ...(this.headers as Record<string, string>),
        ...(customHeaders as Record<string, string>),
    };

    const response = await CapacitorHttp.request({
        url: fullUrl,
        method,
        headers: mergedHeaders,
        data,
        responseType: 'text',
        connectTimeout: REQUEST_TIMEOUT_MS,
        readTimeout: REQUEST_TIMEOUT_MS,
    });

    return toNativeWebDavResponse(response);
  }

  private async performFetchRequest(method: string, fullUrl: string, body?: string | Blob, customHeaders: HeadersInit = {}): Promise<WebDavResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(fullUrl, {
            method,
            headers: {
                ...this.headers,
                ...customHeaders
            },
            body,
            signal: controller.signal
        });
        return toFetchWebDavResponse(response);
    } finally {
        clearTimeout(timeoutId);
    }
  }

  /**
   * Universal request wrapper with retry logic
   */
  private async request(method: string, path: string, body?: string | Blob, customHeaders: HeadersInit = {}): Promise<WebDavResponse> {
    if (!this.url) throw new Error("WebDAV 地址未配置");
    if (!this.auth) throw new Error("WebDAV 账号或密码未配置");

    const fullUrl = `${this.url}${path.startsWith('/') ? '' : '/'}${path}`;
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (true) {
        try {
            const res = shouldUseNativeIosHttp()
                ? await this.performNativeRequest(method, fullUrl, body, customHeaders)
                : await this.performFetchRequest(method, fullUrl, body, customHeaders);

            // Retry on transient errors
            if (res.status === 503 || res.status === 429 || res.status === 502 || res.status === 504) {
                if (attempt < MAX_RETRIES) {
                    attempt++;
                    const delay = 1000 * Math.pow(2, attempt - 1) + (Math.random() * 500);
                    console.warn(`WebDAV ${method} retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms due to ${res.status}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                } else {
                    throw new Error(`服务器繁忙 (${res.status})，请稍后重试`);
                }
            }

            if (!res.ok) {
                if (res.status === 401) throw new Error("认证失败：账号或密码错误 (401)");
            }

            return res;
        } catch (e: any) {
            if (e.message?.includes('认证失败') || e.message?.includes('服务器繁忙')) throw e;

            const message = String(e?.message || '');
            const isNetworkError = e?.name === 'AbortError'
                || message === 'Failed to fetch'
                || message.includes('NetworkError')
                || message.includes('URLSession')
                || message.includes('offline')
                || message.includes('timed out')
                || message.includes('The Internet connection appears to be offline');

            if (isNetworkError && attempt < MAX_RETRIES) {
                attempt++;
                const delay = 1000 * Math.pow(2, attempt - 1) + (Math.random() * 500);
                console.warn(`Network error retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (e?.name === 'AbortError' || message.includes('timed out')) {
                throw new Error(`连接超时：服务器响应时间过长 (${REQUEST_TIMEOUT_MS / 1000}s)`);
            }
            if (message === 'Failed to fetch' || message.includes('NetworkError') || message.includes('URLSession') || message.includes('offline')) {
                throw new Error("网络错误：无法连接到服务器。请检查：1.地址 2.HTTPS 3.跨域/平台限制");
            }

            throw e;
        }
    }
  }

  async checkConnection(): Promise<boolean> {
      try {
          try {
            const resProp = await this.request('PROPFIND', '/', undefined, { 'Depth': '0' });
            if (resProp.ok || resProp.status === 207) return true;
            if (resProp.status !== 405) {
                if (resProp.status === 401) throw new Error("认证失败：账号或密码错误");
            }
          } catch (e: any) {
              const message = String(e?.message || '');
              if (message.includes('认证失败') || message.includes('网络错误') || message.includes('服务器繁忙')) throw e;
          }
          
          const resGet = await this.request('GET', '/');
          if (resGet.ok) return true;
          if (resGet.status === 404 || resGet.status === 403 || resGet.status === 405) return true;
          if (resGet.status === 401) throw new Error("认证失败：账号或密码错误");

          throw new Error(`连接响应异常 (Status: ${resGet.status})`);
      } catch (e: any) {
          console.error("Connection Check Failed:", e);
          throw e;
      }
  }

  /**
   * Upload file with Optimistic Locking (ETag) support.
   * If ifMatch ETag is provided, server will reject if file has changed.
   */
  async putFile(filename: string, content: string | Blob, ifMatch?: string) {
      const isString = typeof content === 'string';
      const headers: Record<string, string> = {
          'Content-Type': isString ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8'
      };
      if (ifMatch) {
          headers['If-Match'] = ifMatch;
      }
      
      const path = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await this.request('PUT', path, content, headers);
      
      if (res.status === 412) {
          throw new Error('SyncConflict');
      }
      
      if (!res.ok) throw new Error(`上传失败 (${res.status})${formatStatusSuffix(res)}`);
      
      return res.headers.get('ETag');
  }

  /**
   * Get file content and ETag.
   */
  async getFile(filename: string): Promise<{ text: string, etag: string | null }> {
      const path = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await this.request('GET', path);
      
      if (res.status === 404) {
          throw new Error(`FileNotExists`);
      }
      if (!res.ok) throw new Error(`下载失败 (${res.status})${formatStatusSuffix(res)}`);
      
      const text = await res.text();
      const etag = res.headers.get('ETag');
      return { text, etag };
  }

  async deleteFile(filename: string) {
      const path = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await this.request('DELETE', path);
      if (!res.ok && res.status !== 404) {
          throw new Error(`删除云端文件失败 (${res.status})${formatStatusSuffix(res)}`);
      }
  }

  /**
   * List files in a directory using PROPFIND.
   * Useful for discovering split files (ledger_l1_2023.csv, ledger_l1_2024.csv...)
   */
  async listFiles(path: string = '/'): Promise<WebDAVFile[]> {
      const res = await this.request('PROPFIND', path, undefined, { 'Depth': '1' });
      if (!res.ok && res.status !== 207) return [];

      const text = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      
      const responses = Array.from(xml.querySelectorAll('response, D\\:response'));
      const files: WebDAVFile[] = [];

      for (const resp of responses) {
          try {
              const hrefNode = resp.querySelector('href, D\\:href');
              let href = hrefNode?.textContent || '';
              href = decodeURIComponent(href);
              
              if (href.replace(/\/$/, '').endsWith(this.url.replace(/^https?:\/\/[^\/]+/, '').replace(/\/$/, ''))) continue;

              const propStat = resp.querySelector('propstat, D\\:propstat');
              if (!propStat) continue;
              
              const prop = propStat.querySelector('prop, D\\:prop');
              if (!prop) continue;

              const resType = prop.querySelector('resourcetype, D\\:resourcetype');
              const isCollection = resType?.querySelector('collection, D\\:collection');
              if (isCollection) continue;

              const getEtag = prop.querySelector('getetag, D\\:getetag');
              const getLastMod = prop.querySelector('getlastmodified, D\\:getlastmodified');
              
              const filename = href.split('/').pop() || '';
              if (filename) {
                  files.push({
                      filename,
                      etag: getEtag?.textContent || null,
                      lastMod: getLastMod?.textContent || null
                  });
              }
          } catch (e) {
              console.warn("Error parsing XML node", e);
          }
      }
      
      return files;
  }
}
