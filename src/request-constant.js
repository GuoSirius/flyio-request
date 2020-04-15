// 其它 Engine 是一个 Factory，唯独这个是一个 类
import Fly from 'flyio/dist/npm/fly'

import get from 'lodash/get'
import constant from 'lodash/constant'
import isFunction from 'lodash/isFunction'

// 请求 发送 数据 类型
export const CONTENT_TYPE_FIELD = 'Content-Type'
export const CONTENT_TYPE_JSON = 'application/json;charset=utf-8'
export const CONTENT_TYPE_FORM = 'application/x-www-form-urlencoded'
export const CONTENT_TYPE_PLAIN = 'text/plain;charset=UTF-8'
export const CONTENT_TYPE_FILE = 'multipart/form-data'

// 错误码 定义
export const NETWORK_ERROR = 0
export const REQUEST_TIMEOUT = 1
export const SAVE_FAILED = 2

// 设置发送内容类型
export function setContentType(options, defaultContentType = CONTENT_TYPE_JSON, headerField = 'headers') {
  let contentType = ''

  switch (options.contentType) {
    case 'json': {
      contentType = CONTENT_TYPE_JSON
      break
    }
    case 'form': {
      contentType = CONTENT_TYPE_FORM
      break
    }
    case 'plain': {
      contentType = CONTENT_TYPE_PLAIN
      break
    }
    case 'file': {
      contentType = CONTENT_TYPE_FILE
      break
    }
    default: {
      contentType = defaultContentType
      break
    }
  }

  options[headerField][CONTENT_TYPE_FIELD] = options[headerField][CONTENT_TYPE_FIELD] || contentType

  return options
}

// 实例化 Fly
export function FlyRequest(engine) {
  const fly = new Fly(engine)

  return fly
}

// 创建请求
export function createRequest(baseURL, timeout = 0, withCredentials = false, engine = null) {
  const flyRequest = FlyRequest(engine)
  // @ts-ignore
  const request = flyRequest.request.bind(flyRequest)

  // 默认配置
  flyRequest.config.baseURL = baseURL
  flyRequest.config.timeout = timeout
  flyRequest.config.parseJson = true
  flyRequest.config.responseType = 'json'
  flyRequest.config.withCredentials = withCredentials
  flyRequest.config.headers = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache'
  }

  return { flyRequest, request }
}

// 绑定 拦截器
export function bindInterceptors(
  flyRequest,
  token,
  tokenKey = 'token',
  storage = null,
  expiredKey = 'data.tokenExpired',
  validateResult = null,
  tokenTimeout = 5000
) {
  token = token || {}
  token.getTokenFromLocal = isFunction(token.getTokenFromLocal) ? token.getTokenFromLocal : constant(false)
  token.getTokenFromServer = isFunction(token.getTokenFromServer)
    ? token.getTokenFromServer
    : () => Promise.reject(new Error('The method getTokenFromServer is not provided!'))
  token.refreshToken = isFunction(token.refreshToken)
    ? token.refreshToken
    : () => Promise.reject(new Error('The method refreshToken is not provided!'))

  storage = storage && isFunction(storage.get) && isFunction(storage.set) ? storage : null

  // 默认 token 是否有效仅取决于 expiredKey，响应结果只做简单判断
  validateResult = isFunction(validateResult)
    ? validateResult
    : (result, isToken) => {
        if (isToken) return true
        else if (!result || result.code) return false
        else {
          result.data = result.data || {}

          return true
        }
      }

  // 请求拦截器
  flyRequest.interceptors.request.use(function (options) {
    // TODO 开启 Loading，可以采用 AjaxHook

    // 获取 token
    let _token = token.getTokenFromLocal()

    // 追加随机数，避免缓存
    options.params._cache = Date.now() + Math.random()

    // 设置 ContentType
    setContentType(options, CONTENT_TYPE_FORM)

    // 本应用需要鉴权
    if (_token !== false) {
      // 附加 token 信息
      if (_token) {
        // 本次请求需要 携带 token
        if (options.needToken !== false) options.headers[tokenKey] = _token
      } else if (options.needToken !== false) {
        // @ts-ignore 锁定当前实例，后续请求会在拦截器外排队
        this.lock()

        // 只有在需要携带 token 时，才重新获取 token，而 token 获取一般走的是登陆逻辑
        return token
          .getTokenFromServer()
          .then(() => {
            // 获取 token
            _token = token.getTokenFromLocal()

            options.headers[tokenKey] = _token

            // 获取成功，继续请求
            return Promise.resolve(options)
          })
          .catch(error => {
            // 终止请求
            error = new Error('No Token !!!')
            // @ts-ignore
            error.request = options

            return Promise.reject(error)
          })
          .finally(() => {
            // @ts-ignore 解锁后，会继续发起请求队列中的任务
            this.unlock()
          })
      }
    }

    return Promise.resolve(options)
  })

  // 响应拦截器
  flyRequest.interceptors.response.use(
    function (response) {
      const result = response.data

      // TODO 关闭 Loading，可以采用 AjaxHook

      // TODO 根据返回 错误码，做相应处理逻辑

      // token 过期，会根据 返回数据字段来判断，但也有可能需要根据返回 code 来判断
      if (get(result, expiredKey) || !validateResult(result, true)) {
        const isLatestToken = storage && storage.get('isLatestToken')

        // token 已被之前的接口刷新过
        if (isLatestToken) {
          // 直接 再次发起请求
          return flyRequest.request(response.request)
        } else {
          // @ts-ignore，锁定响应拦截器
          this.lock()

          // 刷新 token
          return token
            .refreshToken()
            .then(() => {
              // 设置标志位，表明 token 已经刷新过
              storage && storage.set('isLatestToken', true, tokenTimeout)
            })
            .finally(() => {
              // @ts-ignore，解锁响应
              this.unlock()
            })
            .then(() => {
              // 再次发起请求
              return flyRequest.request(response.request)
            })
        }
      } else if (validateResult(result, false)) {
        return Promise.resolve(result)
      } else {
        return Promise.reject(throwError(result))
      }
    },
    function (error) {
      // TODO 关闭 Loading，可以采用 AjaxHook
      return Promise.reject(error)
    }
  )
}

// 请求 异常信息 包装
export function throwError(error, messageKey = 'msg') {
  error = error || {}

  // 20191211 避免 重复处理
  if (error.isCustomException === true) return error

  return {
    errorCode: error.code || error.errorCode || 20161129,
    message: error.message || error[messageKey] || '后端未给出明确异常信息，无法定位',
    data: error.data || {},
    error,
    isCustomException: true
  }
}
