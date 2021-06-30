import axios, { AxiosError } from 'axios';
import { parseCookies, setCookie } from 'nookies';

type FailedRequestsQueueProps = {
  onSuccess: (token: string) => void;
  onFailure: (err: AxiosError<any>) => void;
}

let cookies = parseCookies();
let isRefreshing = false;
let failedRequestsQueue = [] as FailedRequestsQueueProps[];

export const api = axios.create({
  baseURL: 'http://localhost:3333',
  headers: {
    Authorization: `Bearer ${cookies['nextauth.token']}`
  }
})

api.interceptors.response.use(response => {
  return response
}, (error: AxiosError) => {
  if (error.response?.status === 401) {
    if (error.response.data?.code === 'token.expired') {
      // refresh token
      cookies = parseCookies();
      const { 'nextauth.refreshToken': refreshToken } = cookies;
      const originalConfig = error.config;

      if (!isRefreshing) {
        isRefreshing = true;

        api.post('/refresh', {
          refreshToken
        }).then(response => {

          setCookie(undefined, 'nextauth.token', response.data.token, {
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/'
          });
          setCookie(undefined, 'nextauth.refreshToken', response.data.refreshToken, {
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/'
          });

          api.defaults.headers['Authorization'] = `Bearer ${response.data.token}`;

          failedRequestsQueue.forEach(request => request.onSuccess(response.data.token))
          failedRequestsQueue = [];

        }).catch(err => {

          failedRequestsQueue.forEach(request => request.onFailure(err))
          failedRequestsQueue = [];

        }).finally(() => {
          isRefreshing = false;
        })
      }

      return new Promise((resolve, reject) => {
        failedRequestsQueue.push({
          onSuccess: (token: string) => {
            originalConfig.headers['Authorization'] = `Bearer ${token}`
            resolve(api(originalConfig))
          },
          onFailure: (err: AxiosError) => {
            reject(err)
          }
        })
      })

    } else {
      // user logout
    }
  }
})