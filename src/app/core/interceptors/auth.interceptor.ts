import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from 'src/environments/environment';

const AUTH_KEY = 'x-token';

const isBackendUrl = (url: string): boolean => {
  return (
    url.startsWith(environment.backendUrl) ||
    url.startsWith(environment.backendUrlRH)
  );
};

const isLoginRequest = (url: string): boolean => {
  return url.includes(`${environment.api}/login`) && !url.includes('/datausermenu');
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isBackendUrl(req.url) || isLoginRequest(req.url)) {
    return next(req);
  }

  if (req.headers.has('x-token')) {
    return next(req);
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_KEY) : null;
  if (!token) {
    return next(req);
  }

  const authReq = req.clone({ setHeaders: { 'x-token': token } });
  return next(authReq);
};
