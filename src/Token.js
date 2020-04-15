// @ts-nocheck
class Token {
  // Token 验证地址
  verifyURL = ''

  // Token 获取地址
  // tokenURL = ''

  // Token 刷新地址
  refreshTokenURL = ''

  constructor(config) {
    this.verifyURL = config.verifyURL
    // this.tokenURL = config.tokenURL
    this.refreshTokenURL = config.refreshTokenURL
  }

  // 发起请求，必须返回 Promise
  request(options, noRefetch) {
    const error = new Error('Must implement request method!')

    return Promise.reject(error)
  }

  // 验证 Token 有效性，必须返回 Promise
  verifyTokenValidity(result, refreshToken) {
    const error = new Error('Must implement verifyTokenValidity method!')

    return Promise.reject(error)
  }

  // 获取 本地 存储的 refreshToken 值
  getRefreshToken() {
    throw new Error('Must implement getRefreshToken method!')
  }

  // 更新 Token 信息，有值 且 为 truthy 时，进行更新设置，否则删除
  updateTokenInfo(result) {
    throw new Error('Must implement updateTokenInfo method!')
  }

  // 跳转登陆，必须返回 Promise
  redirectToLogin() {
    const error = new Error('Must implement redirectToLogin method!')

    return Promise.reject(error)
  }

  // 需要重载，以实现获取 token 逻辑，返回 false 时，表示无需验证 或者 携带 Token
  getTokenFromLocal() {
    return false
  }

  // Token 验证统一入口
  verify(token) {
    let promise = null

    token = token || this.getTokenFromLocal()

    if (token) promise = this.verifyTokenFromServer(token)
    else promise = this.getTokenFromServer(true)

    return promise
  }

  // 服务端 Token 验证
  verifyTokenFromServer(token) {
    const verifyURL = this.verifyURL

    if (verifyURL && token) {
      return this.request(
        {
          url: verifyURL,
          method: 'POST',
          data: {
            token: token
          }
        },
        true
      )
        .then(result => {
          return this.verifyTokenValidity(result, this.refreshToken.bind(this))
        })
        .catch(() => {
          return this.getTokenFromServer(true)
        })
    } else {
      return this.getTokenFromServer()
    }
  }

  // 刷新 Token
  refreshToken() {
    const refreshTokenURL = this.refreshTokenURL
    const refreshToken = this.getRefreshToken()

    if (refreshTokenURL && refreshToken) {
      return this.request(
        {
          url: refreshTokenURL,
          method: 'GET',
          data: {
            // eslint-disable-next-line @typescript-eslint/camelcase
            grant_type: 'refresh_token',
            // eslint-disable-next-line @typescript-eslint/camelcase
            refresh_token: refreshToken
          }
        },
        true
      )
        .then(result => {
          this.updateTokenInfo(result)
        })
        .catch(() => {
          return this.getTokenFromServer(true)
        })
    } else {
      return this.getTokenFromServer(true)
    }
  }

  // 服务端 获取 Token
  getTokenFromServer(forceFetch) {
    const token = this.getTokenFromLocal()

    if (token !== false && (forceFetch || !token)) {
      // 清空 token 信息
      this.updateTokenInfo()

      // 重新登陆
      this.redirectToLogin().then(() => {
        return Promise.reject(new Error('No Token! Force Fetch Token!'))
      })
    }

    return Promise.resolve()
  }
}

export default Token
