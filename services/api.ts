import axios, { AxiosError } from 'axios'
import { Router } from 'next/router';
import { destroyCookie, parseCookies, setCookie } from 'nookies'
import { signOut } from '../context/AuthContext';

type FailedRequestQueue = {
  onSuccess: (token: string) => void;
  onFailure: (error: AxiosError) => void;
};

let cookies = parseCookies()
let isRefreshing = false
let failedRequestsQueue = Array<FailedRequestQueue>()

export const api = axios.create({
  baseURL: 'http://localhost:3333',
  headers: {
    Authorization: `Bearer ${cookies['next-auth.token']}`
  }
})

api.interceptors.response.use(response => {
  return response
}, (error: AxiosError) => {
  if(error.response?.status == 401) {
    if(error.response.data?.code == 'token.expired') {
      cookies = parseCookies()

      const { 'next-auth.refreshToken': refreshToken } = cookies

      const originalConfig = error.config

      if(!isRefreshing) {
        isRefreshing = true

        api.post('/refresh', {
          refreshToken,
        }).then(response => {
          const { token } = response.data
  
          setCookie(undefined, 'next-auth.token', token, {
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/'
          })
          setCookie(undefined, 'next-auth.refreshToken', response.data.refreshToken, {
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/'
          })
  
          api.defaults.headers.head['Authorization'] = `Bearer ${token}`

          failedRequestsQueue.forEach(request => request.onSuccess(token))
          failedRequestsQueue = []
        }).catch((err) => {
          failedRequestsQueue.forEach(request => request.onFailure(err))
          failedRequestsQueue = []
        }).finally(() => {
          isRefreshing = false
        })
      }

      return new Promise((resolve, reject) => {
        failedRequestsQueue.push({
          onSuccess: (token: string) => {
            if(!originalConfig?.headers)
              return
            
            originalConfig.headers['Authorization'] = `Bearer ${token}`
            
            resolve(api(originalConfig))
          },
          onFailure: (err: AxiosError) => {
            reject(err)
          }
        })
      })

    } else {
      //signOut()
    }
  }
  
  return Promise.reject(error)
})