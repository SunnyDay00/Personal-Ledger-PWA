import { AppSettings } from "../types";

export interface WebDAVFile {
    filename: string;
    etag: string | null;
    lastMod: string | null;
}

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

  /**
   * Universal request wrapper with retry logic
   */
  private async request(method: string, path: string, body?: string | Blob, customHeaders: HeadersInit = {}): Promise<Response> {
    if (!this.url) throw new Error("WebDAV 地址未配置");
    if (!this.auth) throw new Error("WebDAV 账号或密码未配置");

    const fullUrl = `${this.url}${path.startsWith('/') ? '' : '/'}${path}`;
    const MAX_RETRIES = 5; // Increased from 2 to 5 for better stability
    let attempt = 0;

    while (true) {
        const controller = new AbortController();
        const timeout = 20000; 
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const res = await fetch(fullUrl, {
                method,
                headers: {
                    ...this.headers,
                    ...customHeaders
                },
                body,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            // Retry on transient errors
            if (res.status === 503 || res.status === 429 || res.status === 502 || res.status === 504) {
                if (attempt < MAX_RETRIES) {
                    attempt++;
                    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s + random
                    const delay = 1000 * Math.pow(2, attempt - 1) + (Math.random() * 500);
                    console.warn(`WebDAV ${method} retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms due to ${res.status}`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                } else {
                    throw new Error(`服务器繁忙 (${res.status})，请稍后重试`);
                }
            }

            // Global Error Handling
            if (!res.ok) {
                if (res.status === 401) throw new Error("认证失败：账号或密码错误 (401)");
                // 412 Precondition Failed is NOT handled here, it is passed to caller for concurrency handling
            }

            return res;
        } catch (e: any) {
            clearTimeout(timeoutId);

            if (e.message.includes('认证失败') || e.message.includes('服务器繁忙')) throw e;

            const isNetworkError = e.name === 'AbortError' || e.message === 'Failed to fetch' || e.message.includes('NetworkError');

            if (isNetworkError && attempt < MAX_RETRIES) {
                attempt++;
                const delay = 1000 * Math.pow(2, attempt - 1) + (Math.random() * 500);
                console.warn(`Network error retry ${attempt}/${MAX_RETRIES} after ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            if (e.name === 'AbortError') throw new Error("连接超时：服务器响应时间过长 (20s)");
            if (e.message === 'Failed to fetch' || e.message.includes('NetworkError')) throw new Error("网络错误：无法连接到服务器。请检查：1.地址 2.HTTPS 3.跨域");
            
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
              if (e.message.includes('认证失败') || e.message.includes('网络错误') || e.message.includes('服务器繁忙')) throw e;
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
      const headers: any = {
          'Content-Type': isString ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8'
      };
      if (ifMatch) {
          headers['If-Match'] = ifMatch;
      }
      
      const path = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await this.request('PUT', path, content, headers);
      
      if (res.status === 412) {
          throw new Error('SyncConflict'); // Special error for sync logic to catch
      }
      
      if (!res.ok) throw new Error(`上传失败 (${res.status}): ${res.statusText}`);
      
      // Return the new ETag if available
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
      if (!res.ok) throw new Error(`下载失败 (${res.status}): ${res.statusText}`);
      
      const text = await res.text();
      const etag = res.headers.get('ETag');
      return { text, etag };
  }

  async deleteFile(filename: string) {
      const path = filename.startsWith('/') ? filename : `/${filename}`;
      const res = await this.request('DELETE', path);
      if (!res.ok && res.status !== 404) {
          throw new Error(`删除云端文件失败 (${res.status}): ${res.statusText}`);
      }
  }

  /**
   * List files in a directory using PROPFIND.
   * Useful for discovering split files (ledger_l1_2023.csv, ledger_l1_2024.csv...)
   */
  async listFiles(path: string = '/'): Promise<WebDAVFile[]> {
      // PROPFIND Depth 1 to get children
      const res = await this.request('PROPFIND', path, undefined, { 'Depth': '1' });
      if (!res.ok && res.status !== 207) return [];

      const text = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      
      const responses = Array.from(xml.querySelectorAll('response, D\\:response'));
      const files: WebDAVFile[] = [];

      for (const resp of responses) {
          try {
              // Extract href
              const hrefNode = resp.querySelector('href, D\\:href');
              let href = hrefNode?.textContent || '';
              // Decode URI to handle Chinese characters or spaces
              href = decodeURIComponent(href);
              
              // Remove trailing slash to check if it's the directory itself
              if (href.replace(/\/$/, '').endsWith(this.url.replace(/^https?:\/\/[^\/]+/, '').replace(/\/$/, ''))) continue;

              // Extract Props
              const propStat = resp.querySelector('propstat, D\\:propstat');
              if (!propStat) continue;
              
              const prop = propStat.querySelector('prop, D\\:prop');
              if (!prop) continue;

              // Check if directory
              const resType = prop.querySelector('resourcetype, D\\:resourcetype');
              const isCollection = resType?.querySelector('collection, D\\:collection');
              if (isCollection) continue; // Skip subdirectories for now

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